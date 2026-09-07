import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import { boundedJson, json } from '@/lib/cloud-api';
import { notifyUser } from '@/lib/notifications';

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
  await db.prepare(`CREATE TABLE IF NOT EXISTS memory_sync_queue (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, finding_id TEXT NOT NULL,
    operation TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, processed_at TEXT
  )`).run();
  const sync = await db.prepare(`SELECT q.id,q.workspace_id,q.finding_id,q.operation,q.payload,w.repository,w.branch,w.contracts
    FROM memory_sync_queue q JOIN workspaces w ON w.id=q.workspace_id WHERE q.processed_at IS NULL ORDER BY q.created_at LIMIT 1`)
    .first<any>();
  if (sync) return json({ job:{ kind:'memory_sync', ...sync, payload:JSON.parse(sync.payload), contracts:JSON.parse(sync.contracts) } });
  await db.prepare(`CREATE TABLE IF NOT EXISTS workspace_watch_state (
    workspace_id TEXT PRIMARY KEY, last_commit TEXT, last_checked_at TEXT, next_check_at TEXT NOT NULL
  )`).run();
  const due = await db.prepare(`SELECT w.id,w.repository,w.branch,w.contracts,s.last_commit FROM workspaces w
    LEFT JOIN workspace_watch_state s ON s.workspace_id=w.id
    WHERE w.status='watching' AND (s.next_check_at IS NULL OR s.next_check_at <= ?) ORDER BY COALESCE(s.next_check_at,w.created_at) LIMIT 1`)
    .bind(new Date().toISOString()).first<any>();
  if (due) {
    const claimed = new Date(Date.now()+60*60*1000).toISOString();
    await db.prepare(`INSERT INTO workspace_watch_state (workspace_id,next_check_at) VALUES (?,?)
      ON CONFLICT(workspace_id) DO UPDATE SET next_check_at=excluded.next_check_at`).bind(due.id,claimed).run();
    return json({ job:{kind:'recheck',...due,contracts:JSON.parse(due.contracts)} });
  }
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
  return json({ job: { kind:'audit', ...publicJob, contracts: JSON.parse(job.contracts) } });
}

export async function POST(request: Request) {
  if (!authorized(request)) return json({ error: 'Unauthorized' }, 401);
  let body: Record<string, unknown>;
  try { body = await boundedJson(request, 250_000); } catch { return json({ error: 'Invalid result' }, 400); }
  const id = typeof body.id === 'string' ? body.id : '';
  const status = body.status;
  const db = getDb();
  if (!id || !['complete','failed','retry','progress','synced','rechecked'].includes(String(status))) return json({ error: 'Invalid result' }, 400);
  if (status === 'synced') {
    await db.prepare('UPDATE memory_sync_queue SET processed_at = ? WHERE id = ? AND processed_at IS NULL').bind(new Date().toISOString(),id).run();
    return json({ saved:true });
  }
  if (status === 'rechecked') {
    const commit = typeof body.commit === 'string' ? body.commit.slice(0,64) : '';
    const changed = body.changed === true;
    const workspace = await db.prepare('SELECT user_id,repository FROM workspaces WHERE id = ?').bind(id).first<{user_id:string;repository:string}>();
    if (!workspace || !commit) return json({error:'Invalid recheck result'},400);
    const next = new Date(Date.now()+24*60*60*1000).toISOString();
    await db.prepare(`INSERT INTO workspace_watch_state (workspace_id,last_commit,last_checked_at,next_check_at) VALUES (?,?,?,?)
      ON CONFLICT(workspace_id) DO UPDATE SET last_commit=excluded.last_commit,last_checked_at=excluded.last_checked_at,next_check_at=excluded.next_check_at`)
      .bind(id,commit,new Date().toISOString(),next).run();
    if (changed && Array.isArray(body.findings)) {
      const ids = (body.findings as any[]).filter(f=>typeof f?.id==='string').map(f=>f.id);
      const existing = await db.prepare("SELECT id FROM workspace_findings WHERE workspace_id=? AND status IN ('open','confirmed')").bind(id).all<{id:string}>();
      for (const old of existing.results) if (!ids.includes(old.id)) {
        await db.prepare("UPDATE workspace_findings SET status='possible_fix' WHERE id=? AND workspace_id=?").bind(old.id,id).run();
      }
      for (const finding of body.findings as Record<string,unknown>[]) {
        if (typeof finding.id !== 'string' || typeof finding.title !== 'string' || typeof finding.file !== 'string' || typeof finding.severity !== 'string' || typeof finding.description !== 'string') continue;
        await db.prepare(`INSERT INTO workspace_findings (id,workspace_id,user_id,created_at,source,title,contract,severity,description,status)
          VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET description=excluded.description,severity=excluded.severity,status=CASE WHEN workspace_findings.status='possible_fix' THEN 'open' ELSE workspace_findings.status END`)
          .bind(finding.id,id,workspace.user_id,new Date().toISOString(),'pashov',finding.title,finding.file,finding.severity,finding.description,'open').run();
      }
    }
    const message = changed ? 'Repository changed; findings compared with SYBIL memory' : 'Daily recheck complete; no source change';
    await addEvent(db,id,workspace.user_id,'recheck',message);
    if (changed) await notifyUser(workspace.user_id,id,'recheck',`SENTINEL rechecked ${workspace.repository}`,
      `SENTINEL detected a new commit and rechecked the contracts against SYBIL memory. Open your workspace to review the result.`);
    return json({saved:true});
  }
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
  await db.prepare(`CREATE TABLE IF NOT EXISTS workspace_watch_state (
    workspace_id TEXT PRIMARY KEY, last_commit TEXT, last_checked_at TEXT, next_check_at TEXT NOT NULL
  )`).run();
  const commit = typeof body.commit === 'string' ? body.commit.slice(0,64) : '';
  await db.prepare(`INSERT INTO workspace_watch_state (workspace_id,last_commit,last_checked_at,next_check_at) VALUES (?,?,?,?)
    ON CONFLICT(workspace_id) DO UPDATE SET last_commit=excluded.last_commit,last_checked_at=excluded.last_checked_at,next_check_at=excluded.next_check_at`)
    .bind(id,commit,new Date().toISOString(),new Date(Date.now()+24*60*60*1000).toISOString()).run();
  await addEvent(db, id, workspace.user_id, 'complete', 'Audit complete');
  await notifyUser(workspace.user_id,id,'audit_complete','Your SENTINEL audit is ready','The Pashov review completed. Open your SENTINEL workspace to review and confirm the findings.');
  return json({ saved: true });
}
