import { ArrowRight, BrainCircuit, Clock3, FolderGit2, GitBranch, Plus } from 'lucide-react';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { PrivyAccount } from '@/app/privy-controls';
import { getDb } from '@/db';
export const dynamic = 'force-dynamic';
type Summary = { id: string; repository: string; created_at: string; files: string[]; findings: { id: string }[] };
type Workspace = { id: string; repository: string; branch: string; contracts: string; status: string; created_at: string };

export default async function Dashboard() {
  const user = await requireChatGPTUser('/dashboard');
  const db = getDb();
  await db.prepare(`CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
    repository TEXT NOT NULL, branch TEXT NOT NULL, contracts TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued'
  )`).run();
  const workspaceRows = await db.prepare('SELECT id, repository, branch, contracts, status, created_at FROM workspaces WHERE user_id = ? ORDER BY created_at DESC')
    .bind(user.userId).all<Workspace>();
  const workspaces = workspaceRows.results;
  const rows = await db.prepare('SELECT payload FROM reviews WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').bind(user.userId).all<{ payload: string }>();
  const reviews: Summary[] = rows.results.map(row => JSON.parse(row.payload));
  return <div className="app-shell">
    <aside className="app-sidebar"><a href="/" className="brand"><BrainCircuit size={24}/><b>SENTINEL</b></a><div className="side-section"><span>WORKSPACE</span><a className="side-link active" href="/dashboard"><FolderGit2/>All workspaces</a><a className="side-link" href="/dashboard/new"><Plus/>New workspace</a></div><PrivyAccount/></aside>
    <main className="app-main"><header className="app-top"><div><h1>Your workspaces</h1><p>Review contracts and keep track of your findings.</p></div><a className="primary-link" href="/dashboard/new"><Plus size={15}/>New workspace</a></header>

      <section className="workspace-section">
      {workspaces.length ? <div className="workspace-cards">{workspaces.map(workspace => { const contracts = JSON.parse(workspace.contracts) as string[]; const name = workspace.repository.split('/').slice(-2).join('/'); const label = ({draft:'Ready to audit',queued:'Preparing audit',running:'Audit in progress',failed:'Needs attention',watching:'Watching for fixes'} as Record<string,string>)[workspace.status] || workspace.status; return <article className="workspace-card" key={workspace.id}><div className="workspace-card-top"><div className="repo-mark"><GitBranch/></div><div><h3>{name}</h3><p>{workspace.branch} Â· created {new Date(workspace.created_at).toLocaleDateString('en-GB')}</p></div><span className="live-pill"><i/>{label}</span></div><div className="workspace-stats"><span><b>{contracts.length}</b> contracts</span></div><div className="workspace-foot"><span><Clock3/>{label}</span><a href={`/dashboard/workspaces/${workspace.id}`}>Open workspace <ArrowRight/></a></div></article>})}</div>
      : <div className="first-workspace"><h2>Start your first review</h2><p>Paste a public GitHub repository, choose its Solidity contracts, and start your first Pashov review.</p><a className="primary-link" href="/dashboard/new">Create your first workspace<ArrowRight size={15}/></a><small>1. Add repository Â· 2. Select contracts Â· 3. Review</small></div>}</section>
      <section id="activity" className="activity-section"><div className="workspace-title"><div><h2>Recent activity</h2><p>Reviews, decisions, code changes, and proofs appear here.</p></div></div>
      {reviews.length ? <div className="activity-list">{reviews.slice(0,5).map(review=><article key={review.id}><span className="activity-icon"><BrainCircuit/></span><div><b>Pashov review completed</b><p>{review.files.length} contracts checked Â· {review.findings.length} findings Â· {review.repository}</p></div><time>{new Date(review.created_at).toLocaleDateString('en-GB')}</time></article>)}</div> : <div className="activity-empty">Your workspace activity will appear after the first review.</div>}</section>
    </main>
  </div>;
}
