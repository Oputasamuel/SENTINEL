import { getDb } from '@/db';
import { json } from '@/lib/cloud-api';
import { workspaceUser } from '@/lib/workspace-auth';
export async function GET(request: Request, { params }: { params: Promise<{id:string}> }) {
 const user = await workspaceUser(request);
 if (!user) return json({error:'Sign in required.'},401);
 const {id}=await params;
 const row=await getDb().prepare('SELECT id, repository, branch, contracts, status, created_at FROM workspaces WHERE id = ? AND user_id = ?').bind(id,user.userId).first<any>();
 if (!row) return json({error:'Workspace not found.'},404);
 return json({...row,contracts:JSON.parse(row.contracts),url:`/dashboard/workspaces/${id}`});
}
