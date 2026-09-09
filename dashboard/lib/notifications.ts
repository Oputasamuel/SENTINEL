import { env } from 'cloudflare:workers';
import { getDb } from '@/db';

const notificationsTable = `CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL, subject TEXT NOT NULL, created_at TEXT NOT NULL,
  delivered_at TEXT, error TEXT
)`;

export async function notifyUser(userId: string, workspaceId: string, kind: string, subject: string, text: string) {
  try {
    const db = getDb();
    await db.prepare(notificationsTable).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY, email TEXT NOT NULL DEFAULT '', wallet_address TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`).run();
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO notification_log (id,user_id,workspace_id,kind,subject,created_at) VALUES (?,?,?,?,?,?)')
      .bind(id,userId,workspaceId,kind,subject,new Date().toISOString()).run();
    const profile = await db.prepare('SELECT email FROM user_profiles WHERE user_id = ?').bind(userId).first<{email:string}>();
    const key = env.RESEND_API_KEY;
    const sender = env.SENTINEL_EMAIL_FROM;
    if (!profile?.email || typeof key !== 'string' || typeof sender !== 'string') return { delivered:false, reason:'not_configured' };
    const response = await fetch('https://api.resend.com/emails', { method:'POST', headers:{ authorization:`Bearer ${key}`, 'content-type':'application/json' },
      body:JSON.stringify({ from:sender, to:[profile.email], subject, text }) });
    if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}`);
    await db.prepare('UPDATE notification_log SET delivered_at = ? WHERE id = ?').bind(new Date().toISOString(),id).run();
    return { delivered:true };
  } catch (error) {
    return { delivered:false, reason:'delivery_failed' };
  }
}
