import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { json } from '@/lib/cloud-api';
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({ error: 'Sign in required' }, 401);
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Invalid origin' }, 403);
  await getDb().prepare('DELETE FROM cli_sessions WHERE user_id = ?').bind(user.userId).run();
  return Response.redirect(new URL('/dashboard', request.url), 303);
}
