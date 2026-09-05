import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import { boundedJson, json } from '@/lib/cloud-api';

function authorized(request: Request) {
  const expected = env.SENTINEL_WORKER_TOKEN;
  return typeof expected === 'string' && expected.length >= 32 && request.headers.get('authorization') === `Bearer ${expected}`;
}

const createEventsTable = `CREATE TABLE IF NOT EXISTS workspace_events (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
  created_at TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL
)`;

async function addEvent(db: ReturnType<typeof getDb>, workspaceId: string, userId: string, kind: string, message: string) {
  await db.prepare(createEventsTable).run();
  await db.prepare('INSERT INTO workspace_events (id, workspace_id, user_id, created_at, kind, message) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), workspaceId, userId, new Date().toISOString(), kind, message).run();
}

export async function GET(request: Request) {
  if (!authorized(request)) return json({ error: 'Unauthorized' }, 401);
  const db = getDb();
  const job = await db.prepare("SELECT id, user_id, repository, branch, contracts FROM workspaces WHERE status = 'queued' ORDER BY created_at LIMIT 1").first<{id:string;user_id:string;repository:string;branch:string;contracts:string}>();
  if (!job) return json({ job: null });
  const claimed = await db.prepare("UPDATE workspaces SET status = 'running' WHERE id = ? AND status = 'queued'").bind(job.id).run();
  if (!claimed.meta.changes) return json({ job: null });
  try {
    await addEvent(db, job.id, job.user_id, 'progress', 'Preparing selected contracts');
  } catch (error) {
    await db.prepare("UPDATE workspaces SET status = 'queued' WHERE id = ? AND status = 'running'").bind(job.id).run();
    throw error;
  }
  const { user_id: _userId, ...publicJob } = job;
  return json({ job: { ...publicJob, contracts: JSON.parse(job.contracts) } });
}

export async function POST(request: Request) {
  if (!authorized(request)) return json({ error: 'Unauthorized' }, 401);
  let body: Record<string, unknown>;
  try { body = await boundedJson(request, 250_000); } catch { return json({ error: 'Invalid result' }, 400); }
  const id = typeof body.id === 'string' ? body.id : '';
  const status = body.status;
  const db = getDb();
  if (!id || !['complete','failed','retry','progress'].includes(String(status))) return json({ error: 'Invalid result' }, 400);
  if (status === 'progress') {
    const message = typeof body.message === 'string' ? body.message.slice(0, 200) : '';
    if (!message) return json({ error: 'Progress message required' }, 400);
    const workspace = await db.prepare('SELECT user_id FROM workspaces WHERE id = ?').bind(id).first<{user_id:string}>();
    if (!workspace) return json({ error: 'Workspace not found' }, 404);
    await addEvent(db, id, workspace.user_id, 'progress', message);
    return json({ saved: true });
  }
  if (status === 'retry') {
    await db.prepare("UPDATE workspaces SET status = 'queued' WHERE id = ? AND status = 'failed'").bind(id).run();
    return json({ saved: true });
  }
  if (status === 'failed') {
    await db.prepare("UPDATE workspaces SET status = 'failed' WHERE id = ?").bind(id).run();
    const workspace = await db.prepare('SELECT user_id FROM workspaces WHERE id = ?').bind(id).first<{user_id:string}>();
    if (!workspace) return json({ error: 'Workspace not found' }, 404);
    await addEvent(db, id, workspace.user_id, 'failed', 'The audit needs attention');
    return json({ saved: true });
  }
  const findings = Array.isArray(body.findings) ? body.findings : [];
  if (findings.length > 30) return json({ error: 'Too many findings' }, 400);
  await db.prepare(`CREATE TABLE IF NOT EXISTS workspace_findings (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
    created_at TEXT NOT NULL, source TEXT NOT NULL, title TEXT NOT NULL,
    contract TEXT NOT NULL, severity TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL
  )`).run();
  const workspace = await db.prepare('SELECT user_id FROM workspaces WHERE id = ?').bind(id).first<{user_id:string}>();
  if (!workspace) return json({ error: 'Workspace not found' }, 404);
  for (const finding of findings as Record<string,unknown>[]) {
    if (typeof finding.id !== 'string' || typeof finding.title !== 'string' || typeof finding.file !== 'string'
        || typeof finding.severity !== 'string' || typeof finding.description !== 'string') continue;
    await db.prepare('INSERT OR REPLACE INTO workspace_findings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(finding.id, id, workspace.user_id, new Date().toISOString(), 'pashov', finding.title, finding.file, finding.severity, finding.description, 'open').run();
  }
  await db.prepare("UPDATE workspaces SET status = 'watching' WHERE id = ?").bind(id).run();
  await addEvent(db, id, workspace.user_id, 'complete', 'Audit complete');
  return json({ saved: true });
}
