import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { boundedJson, json } from '@/lib/cloud-api';

export async function PATCH(request: Request, { params }: { params: Promise<{ id:string; findingId:string }> }) {
  const user = await getChatGPTUser();
  if (!user) return json({ error:'Sign in required.' }, 401);
  const { id, findingId } = await params;
  let body: Record<string, unknown>;
  try { body = await boundedJson(request, 1000); } catch { return json({ error:'Invalid decision.' }, 400); }
  const status = typeof body.status === 'string' ? body.status : '';
  if (!['open','confirmed','dismissed','fixed'].includes(status)) return json({ error:'Invalid decision.' }, 400);
  const db = getDb();
  const workspace = await db.prepare('SELECT id FROM workspaces WHERE id = ? AND user_id = ?').bind(id,user.userId).first();
  if (!workspace) return json({ error:'Workspace not found.' }, 404);
  const result = await db.prepare('UPDATE workspace_findings SET status = ? WHERE id = ? AND workspace_id = ? AND user_id = ?').bind(status,findingId,id,user.userId).run();
  if (!result.meta.changes) return json({ error:'Finding not found.' }, 404);
  await db.prepare(`CREATE TABLE IF NOT EXISTS workspace_events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL)`).run();
  await db.prepare('INSERT INTO workspace_events VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(),id,user.userId,new Date().toISOString(),'decision',`Finding marked ${status}`).run();
  return json({ saved:true });
}
