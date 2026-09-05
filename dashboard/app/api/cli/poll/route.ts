import { getDb } from '@/db';
import { boundedJson, hash, json, randomToken } from '@/lib/cloud-api';
export async function POST(request: Request) {
  let body;
  try { body = await boundedJson(request, 200); } catch { return json({ error: 'Invalid request' }, 400); }
  if (!/^[a-f0-9]{64}$/.test(body.device_code || '')) return json({ error: 'Invalid code' }, 400);
  const db = getDb(), now = Date.now(), deviceHash = await hash(body.device_code);
  const device = await db.prepare('SELECT user_id, expires_at, consumed FROM cli_devices WHERE device_hash = ?')
    .bind(deviceHash).first<{ user_id: string | null; expires_at: number; consumed: number }>();
  if (!device || device.expires_at <= now || device.consumed) return json({ status: 'expired' });
  if (!device.user_id) return json({ status: 'pending' });
  const consumed = await db.prepare('UPDATE cli_devices SET consumed = 1 WHERE device_hash = ? AND consumed = 0 AND expires_at > ? RETURNING user_id')
    .bind(deviceHash, now).first<{ user_id: string }>();
  if (!consumed) return json({ status: 'expired' });
  const token = randomToken();
  await db.prepare('INSERT INTO cli_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await hash(token), consumed.user_id, now, now + 30 * 86400000).run();
  return json({ token, expires_in: 30 * 86400 });
}
