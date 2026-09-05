import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { cliUser, hash, json } from '@/lib/cloud-api';
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({ error: 'Sign in required' }, 401);
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Invalid origin' }, 403);
  await getDb().prepare('DELETE FROM cli_sessions WHERE user_id = ?').bind(user.userId).run();
  return Response.redirect(new URL('/dashboard', request.url), 303);
}

export async function DELETE(request: Request) {
 const userId = await cliUser(request);
 if (!userId) return json({error:'Sign in required.'},401);
 await getDb().prepare('DELETE FROM cli_sessions WHERE token_hash = ? AND user_id = ?').bind(await hash(request.headers.get('authorization')!.slice(7)),userId).run();
 return json({revoked:true});
}
