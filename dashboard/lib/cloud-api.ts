import { getDb } from '@/db';

export async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export function randomToken(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
export async function cliUser(request: Request) {
  const header = request.headers.get('authorization') || '';
  if (!/^Bearer [a-f0-9]{64}$/.test(header)) return null;
  const row = await getDb().prepare('SELECT user_id FROM cli_sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(await hash(header.slice(7)), Date.now()).first<{ user_id: string }>();
  return row?.user_id || null;
}
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function boundedJson(request: Request, max = 100_000) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('JSON required');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Body required');
  const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { await reader.cancel(); throw new Error('Request too large'); }
    chunks.push(value);
  }
  const all = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(all));
}
