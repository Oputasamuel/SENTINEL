import { workspaceUser } from '@/lib/workspace-auth';
import { getDb } from '@/db';
import { boundedJson, json } from '@/lib/cloud-api';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await workspaceUser(request);
  if (!user) return json({ error: 'Sign in required.' }, 401);
  const { id: workspaceId } = await params;
  const db = getDb();
  const workspace = await db.prepare('SELECT id, contracts FROM workspaces WHERE id = ? AND user_id = ?').bind(workspaceId, user.userId).first<{id:string;contracts:string}>();
  if (!workspace) return json({ error: 'Workspace not found.' }, 404);
  let body: Record<string, unknown>;
  try { body = await boundedJson(request, 20_000); } catch { return json({ error: 'Invalid finding.' }, 400); }
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const contract = typeof body.contract === 'string' ? body.contract.trim() : '';
  const severity = typeof body.severity === 'string' ? body.severity : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!JSON.parse(workspace.contracts).includes(contract)) return json({ error: 'Choose a contract in this workspace.' }, 400);
  if (!title || title.length > 300 || !contract || contract.length > 500 || !['critical','high','medium','low'].includes(severity) || !description || description.length > 5000)
    return json({ error: 'Complete every finding field.' }, 400);
  await db.prepare(`CREATE TABLE IF NOT EXISTS workspace_findings (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
    created_at TEXT NOT NULL, source TEXT NOT NULL, title TEXT NOT NULL,
    contract TEXT NOT NULL, severity TEXT NOT NULL, description TEXT NOT NULL,
    status TEXT NOT NULL
  )`).run();
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO workspace_findings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, workspaceId, user.userId, new Date().toISOString(), 'manual', title, contract, severity, description, 'open').run();
  return json({ saved: true, id }, 201);
}

export async function GET(request: Request, {params}: {params:Promise<{id:string}>}) {
 const user=await workspaceUser(request); if(!user) return json({error:'Sign in required.'},401);
 const {id}=await params; const db=getDb();
 const workspace=await db.prepare('SELECT id FROM workspaces WHERE id = ? AND user_id = ?').bind(id,user.userId).first();
 if(!workspace) return json({error:'Workspace not found.'},404);
 const table=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspace_findings'").first();
 if(!table) return json({findings:[]});
 const rows=await db.prepare('SELECT id, title, contract, severity, description, status, source, created_at FROM workspace_findings WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC').bind(id,user.userId).all();
 return json({findings:rows.results});
}
