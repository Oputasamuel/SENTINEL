import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { boundedJson, json } from '@/lib/cloud-api';

const createTable = `CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  repository TEXT NOT NULL,
  branch TEXT NOT NULL,
  contracts TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
)`;

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({ error: 'Sign in to create a workspace.' }, 401);
  let body: Record<string, unknown>;
  try { body = await boundedJson(request, 60_000); }
  catch { return json({ error: 'Invalid workspace request.' }, 400); }
  const repository = typeof body.repository === 'string' ? body.repository.trim() : '';
  const branch = typeof body.branch === 'string' ? body.branch.trim() : '';
  const contracts = Array.isArray(body.contracts) ? body.contracts : [];
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/i.test(repository)
      || !branch || branch.length > 200 || !contracts.length || contracts.length > 8
      || contracts.some(path => typeof path !== 'string' || path.length > 500 || !path.toLowerCase().endsWith('.sol') || path.includes('..'))) {
    return json({ error: 'Select valid Solidity contracts from a public GitHub repository.' }, 400);
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const db = getDb();
  await db.prepare(createTable).run();
  const active = await db.prepare("SELECT COUNT(*) AS total FROM workspaces WHERE user_id = ? AND status IN ('queued','running')").bind(user.userId).first<{total:number}>();
  if ((active?.total || 0) >= 1) return json({ error: 'Finish the active audit before starting another.' }, 409);
  const daily = await db.prepare('SELECT COUNT(*) AS total FROM workspaces WHERE user_id = ? AND created_at LIKE ?').bind(user.userId, new Date().toISOString().slice(0, 10) + '%').first<{total:number}>();
  if ((daily?.total || 0) >= 3) return json({ error: 'Daily workspace limit reached. Try again tomorrow.' }, 429);
  await db.prepare('INSERT INTO workspaces (id, user_id, created_at, repository, branch, contracts, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, user.userId, now, repository.replace(/\/$/, ''), branch, JSON.stringify(contracts), 'queued').run();
  return json({ id, saved: true, url: `/dashboard/workspaces/${id}` }, 201);
}
