import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { json } from '@/lib/cloud-api';
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({ error: 'Sign in required' }, 401);
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Invalid origin' }, 403);
  const form = await request.formData();
  const code = String(form.get('code') || '').toUpperCase();
  if (!/^[A-F0-9]{8}$/.test(code)) return json({ error: 'Invalid code' }, 400);
  const approved = await getDb().prepare('UPDATE cli_devices SET user_id = ? WHERE user_code = ? AND user_id IS NULL AND consumed = 0 AND expires_at > ? RETURNING user_code')
    .bind(user.userId, code, Date.now()).first();
  if (!approved) return json({ error: 'Code expired or already used. Start login again.' }, 400);
  return Response.redirect(new URL('/dashboard?connected=1', request.url), 303);
}
