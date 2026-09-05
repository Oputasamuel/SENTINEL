import { getDb } from '@/db';
import { boundedJson, cliUser, json } from '@/lib/cloud-api';
export async function POST(request: Request) {
  const userId = await cliUser(request);
  if (!userId) return json({ error: 'CLI login required' }, 401);
  let body;
  try { body = await boundedJson(request); } catch { return json({ error: 'Invalid review summary' }, 400); }
  const string = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;
  if (!string(body.id, 36) || !/^[a-f0-9-]{36}$/.test(body.id) || !string(body.repository, 200)
      || !string(body.created_at, 50) || !Number.isFinite(Date.parse(body.created_at))
      || !string(body.commit, 100) || !string(body.source_digest, 64) || !string(body.provider, 30) || !string(body.model, 200)
      || !['memory-aware', 'baseline'].includes(body.mode) || !Number.isInteger(body.memory_count) || body.memory_count < 0
      || !Array.isArray(body.files) || body.files.length > 20 || body.files.some((f: unknown) => !string(f, 500))
      || !Array.isArray(body.findings) || body.findings.length > 30) return json({ error: 'Invalid review fields' }, 400);
  for (const f of body.findings) {
    if (!f || !string(f.id, 100) || !string(f.title, 500) || !string(f.file, 500) || !body.files.includes(f.file)
        || !Number.isInteger(f.line) || f.line < 1 || !['critical','high','medium','low'].includes(f.severity)
        || !['open','confirmed','false_positive','fixed','ignored'].includes(f.status)) return json({ error: 'Invalid finding summary' }, 400);
  }
  // Whitelist fields. Keys, source, evidence snippets, and arbitrary properties are never persisted.
  const payload = { id: body.id, created_at: body.created_at, repository: body.repository, commit: body.commit,
    source_digest: body.source_digest, provider: body.provider, model: body.model, mode: body.mode,
    memory_count: body.memory_count, files: body.files,
    findings: body.findings.map((f: { id: string; title: string; file: string; line: number; severity: string; status: string }) =>
      ({ id: f.id, title: f.title, file: f.file, line: f.line, severity: f.severity, status: f.status })) };
  const result = await getDb().prepare('INSERT INTO reviews (id, user_id, created_at, repository, payload) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload WHERE reviews.user_id = excluded.user_id')
    .bind(body.id, userId, body.created_at, body.repository, JSON.stringify(payload)).run();
  if (!result.meta.changes) return json({ error: 'Review identifier is unavailable' }, 409);
  return json({ saved: true, url: new URL('/dashboard', request.url).toString() });
}
