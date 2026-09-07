import { notFound } from 'next/navigation';
import { ArrowLeft, BrainCircuit, Clock3, ExternalLink, FileCode2, GitBranch, Radar, ShieldAlert } from 'lucide-react';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import ManualFinding from './manual-finding';
import AuditRefresh from './audit-refresh';
import FindingActions from './finding-actions';
import BaseProof from './base-proof';

type Workspace = { id:string; repository:string; branch:string; contracts:string; status:string; created_at:string };
type Finding = { id:string; source:string; title:string; contract:string; severity:string; description:string; status:string; created_at:string };
type Event = { message:string; kind:string; created_at:string };

export default async function WorkspacePage({ params }: { params: Promise<{ id:string }> }) {
  const { id } = await params;
  const user = await requireChatGPTUser(`/dashboard/workspaces/${id}`);
  const db = getDb();
  const workspace = await db.prepare('SELECT id, repository, branch, contracts, status, created_at FROM workspaces WHERE id = ? AND user_id = ?').bind(id, user.userId).first<Workspace>();
  if (!workspace) notFound();
  await db.prepare(`CREATE TABLE IF NOT EXISTS workspace_findings (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
    created_at TEXT NOT NULL, source TEXT NOT NULL, title TEXT NOT NULL,
    contract TEXT NOT NULL, severity TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL
  )`).run();
  const rows = await db.prepare('SELECT id, source, title, contract, severity, description, status, created_at FROM workspace_findings WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC').bind(id,user.userId).all<Finding>();
  await db.prepare(`CREATE TABLE IF NOT EXISTS workspace_events (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
    created_at TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL
  )`).run();
  const latest = await db.prepare('SELECT message, kind, created_at FROM workspace_events WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1').bind(id,user.userId).first<Event>();
  const contracts = JSON.parse(workspace.contracts) as string[];
  const name = workspace.repository.split('/').slice(-2).join('/');
  const statusText = latest?.message || ({ queued: 'Preparing your audit', running: 'Audit in progress', failed: 'Audit needs attention', watching: 'Watching for fixes' }[workspace.status] ?? workspace.status);
  return <main className="workspace-page"><AuditRefresh active={workspace.status === 'queued' || workspace.status === 'running'}/><a className="back-link" href="/dashboard"><ArrowLeft/>All workspaces</a>
    <header className="workspace-detail-head"><div className="repo-mark"><GitBranch/></div><div><span className="eyebrow">SECURITY WORKSPACE</span><h1>{name}</h1><p>{workspace.branch} · {contracts.length} watched contracts</p></div><a className="outline-link" href={workspace.repository} target="_blank" rel="noreferrer">Open GitHub<ExternalLink/></a></header>
    <section className="workspace-health"><article><Radar/><div><span>Audit status</span><b>{statusText}</b><small>{workspace.status === 'failed' ? 'Open the workspace again to retry safely.' : workspace.status === 'watching' ? 'SENTINEL remembers these findings and checks for fixes.' : 'You can leave this page while SENTINEL works.'}</small></div></article><article><BrainCircuit/><div><span>Remembered findings</span><b>{rows.results.length} findings</b><small>Sibyl keeps each accepted and manual finding tied to this workspace.</small></div></article><article><Clock3/><div><span>Daily checks</span><b>{workspace.status === 'watching' ? 'Ready' : 'Starts after audit'}</b><small>SENTINEL will compare future repository changes with remembered findings.</small></div></article></section>
    <section className="workspace-columns"><div><div className="workspace-title"><div><h2>Findings</h2><p>Automated results and your own findings live together.</p></div><ManualFinding workspaceId={id} contracts={contracts}/></div>{rows.results.length?<div className="finding-cards">{rows.results.map(f=><article key={f.id}><div><span className={`severity ${f.severity}`}>{f.severity}</span><span className="tag">{f.source === 'pashov' ? 'SENTINEL' : 'MANUAL'}</span></div><h3>{f.title}</h3><p>{f.description}</p><footer><span><FileCode2/>{f.contract}</span><b>{f.status}</b></footer><FindingActions workspaceId={id} findingId={f.id} status={f.status}/></article>)}</div>:<div className="activity-empty"><ShieldAlert/><b>No findings yet</b><span>Add a manual finding now. Automated findings will appear when your audit completes.</span></div>}</div>
      <aside><div className="panel contract-panel"><div className="section-head"><span><FileCode2/>Watched contracts</span><em>{contracts.length}</em></div>{contracts.map(path=><div className="watched-contract" key={path}><FileCode2/><span><b>{path.split('/').pop()}</b><small>{path}</small></span></div>)}</div><BaseProof workspaceId={id} state={{workspaceId:id,repository:workspace.repository,branch:workspace.branch,findings:rows.results.map(f=>({id:f.id,status:f.status}))}}/></aside></section>
  </main>;
}
