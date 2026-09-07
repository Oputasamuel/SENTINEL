import { PrivyClient } from '@privy-io/node';
import { createSessionValue, sentinelSessionCookie } from '@/app/sentinel-auth';
import { json } from '@/lib/cloud-api';
import { getDb } from '@/db';

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!token || !appId || !appSecret) return json({ error: 'Privy authentication is not configured.' }, 503);

  let claim: { user_id: string };
  try {
    const privy = new PrivyClient({ appId, appSecret });
    claim = await privy.utils().auth().verifyAuthToken(token);
    if (!claim.user_id) throw new Error('Verified token has no user ID.');
  } catch { return json({ error: 'Your Privy session is invalid or expired.' }, 401); }

  const body = await request.json().catch(() => ({})) as { email?: string; walletAddress?: string };
  const email = typeof body.email === 'string' && body.email.length <= 320 ? body.email : '';
  const walletAddress = typeof body.walletAddress === 'string' && /^0x[a-fA-F0-9]{40}$/.test(body.walletAddress) ? body.walletAddress.toLowerCase() : null;
  const displayName = email || (walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : 'Bug hunter');
  const db = getDb();
  await db.prepare(`CREATE TABLE IF NOT EXISTS user_profiles (
    user_id TEXT PRIMARY KEY, email TEXT NOT NULL DEFAULT '', wallet_address TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`).run();
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO user_profiles (user_id,email,wallet_address,created_at,updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,wallet_address=excluded.wallet_address,updated_at=excluded.updated_at`)
    .bind(claim.user_id,email,walletAddress,now,now).run();
  const value = await createSessionValue({ userId: claim.user_id, displayName, email, walletAddress });
  return new Response(JSON.stringify({ authenticated: true, walletAddress }), {
    headers: {
      'content-type': 'application/json',
      'set-cookie': `${sentinelSessionCookie}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
    },
  });
}

export async function DELETE() {
  return new Response(JSON.stringify({ authenticated: false }), {
    headers: { 'content-type': 'application/json', 'set-cookie': `${sentinelSessionCookie}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` },
  });
}
