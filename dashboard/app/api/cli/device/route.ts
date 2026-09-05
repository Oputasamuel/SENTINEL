import { getDb } from '@/db';
import { boundedJson, hash, json, randomToken } from '@/lib/cloud-api';

export async function POST(request: Request) {
  try { await boundedJson(request, 100); } catch { return json({ error: 'Invalid request' }, 400); }
  const db = getDb(), now = Date.now();
  const ipHash = await hash(request.headers.get('cf-connecting-ip') || 'local');
  const count = await db.prepare('SELECT COUNT(*) AS total FROM cli_devices WHERE ip_hash = ? AND created_at > ?')
    .bind(ipHash, now - 600000).first<{ total: number }>();
  if ((count?.total || 0) >= 10) return json({ error: 'Please wait before starting another login' }, 429);
  const deviceCode = randomToken(), userCode = randomToken(4).toUpperCase();
  await db.batch([
    db.prepare('DELETE FROM cli_devices WHERE expires_at < ?').bind(now - 3600000),
    db.prepare('INSERT INTO cli_devices (device_hash, user_code, ip_hash, created_at, expires_at, consumed) VALUES (?, ?, ?, ?, ?, 0)')
      .bind(await hash(deviceCode), userCode, ipHash, now, now + 600000),
  ]);
  return json({ device_code: deviceCode, user_code: userCode, expires_in: 600, interval: 5 });
}
