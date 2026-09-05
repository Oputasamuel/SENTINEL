import { getDb } from '@/db';
import { json } from '@/lib/cloud-api';
import { workspaceUser } from '@/lib/workspace-auth';
export async function POST(request: Request, { params }: {params:Promise<{id:string}>}) {
 const user=await workspaceUser(request); if(!user) return json({error:'Sign in required.'},401);
 const {id}=await params; const db=getDb();
 const row=await db.prepare('SELECT status FROM workspaces WHERE id = ? AND user_id = ?').bind(id,user.userId).first<{status:string}>();
 if(!row) return json({error:'Workspace not found.'},404);
 if(['queued','running'].includes(row.status)) return json({id,status:row.status});
 if(row.status !== 'draft') return json({error:'This workspace has already been audited. Create a new workspace for another review.'},409);
 const result=await db.prepare("UPDATE workspaces SET status = 'queued' WHERE id = ? AND user_id = ? AND status = 'draft' AND NOT EXISTS (SELECT 1 FROM workspaces WHERE user_id = ? AND status IN ('queued','running'))").bind(id,user.userId,user.userId).run();
 if(!result.meta.changes) return json({error:'Finish the active audit before starting another.'},409);
 return json({id,status:'queued'},202);
}
