'use client';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, BrainCircuit, Check, FileCode2, GitBranch, LoaderCircle, Search } from 'lucide-react';

type Repo = { owner: string; name: string; branch: string; contracts: string[] };

export default function NewWorkspace() {
  const [url, setUrl] = useState('');
  const [repo, setRepo] = useState<Repo|null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  async function discover() {
    setError(''); setRepo(null); setLoading(true);
    try {
      const match = url.trim().match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/i);
      if (!match) throw new Error('Paste a public GitHub repository link.');
      const [, owner, name] = match;
      const info = await fetch(`https://api.github.com/repos/${owner}/${name}`);
      if (!info.ok) throw new Error(info.status === 404 ? 'Repository not found or not public.' : 'GitHub could not read this repository.');
      const metadata = await info.json();
      const tree = await fetch(`https://api.github.com/repos/${owner}/${name}/git/trees/${encodeURIComponent(metadata.default_branch)}?recursive=1`);
      if (!tree.ok) throw new Error('Could not inspect the repository files.');
      const data = await tree.json();
      const contracts = (data.tree || []).filter((item: {type:string,path:string}) => item.type === 'blob' && item.path.toLowerCase().endsWith('.sol')).map((item:{path:string})=>item.path).slice(0, 250);
      if (!contracts.length) throw new Error('No Solidity contracts were found.');
      setRepo({ owner, name, branch: metadata.default_branch, contracts }); setSelected(contracts.slice(0, Math.min(8, contracts.length)));
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setLoading(false); }
  }
  function toggle(path:string){ setSelected(current=>current.includes(path)?current.filter(item=>item!==path):(current.length<8?[...current,path]:current)); }
  async function createWorkspace() {
    if (!repo || !selected.length) return;
    setCreating(true); setError('');
    try {
      const response = await fetch('/api/workspaces', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repository: `https://github.com/${repo.owner}/${repo.name}`, branch: repo.branch, contracts: selected }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not create the workspace.');
      window.location.assign(result.url || '/dashboard');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the workspace.'); setCreating(false); }
  }
  return <main className="setup-page"><a href="/dashboard" className="back-link"><ArrowLeft/>Back to workspaces</a><div className="setup-heading"><span className="eyebrow">NEW WORKSPACE</span><h1>Choose what SENTINEL should watch.</h1><p>Start with a public GitHub repository. You will choose the contracts before any review begins.</p></div>
    <div className="setup-progress"><span className="done"><i>1</i>Repository</span><b/><span className={repo?'done':''}><i>2</i>Contracts</span><b/><span><i>3</i>Review</span></div>
    <section className="setup-card"><div className="setup-card-head"><GitBranch/><div><h2>Connect a repository</h2><p>SENTINEL reads public source code directly from GitHub.</p></div></div><label className="repo-input"><span>GitHub repository URL</span><div><GitBranch/><input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&discover()} placeholder="https://github.com/owner/repository"/><button onClick={discover} disabled={loading||!url.trim()}>{loading?<LoaderCircle className="spin"/>:<Search/>}{loading?'Finding contracts…':'Find contracts'}</button></div></label>{error&&<p className="setup-error">{error}</p>}</section>
    {repo&&<section className="setup-card contract-picker"><div className="setup-card-head"><FileCode2/><div><h2>Select up to 8 contracts</h2><p>{repo.owner}/{repo.name} · {repo.branch} · {repo.contracts.length} Solidity files found</p></div><button className="plain-button" onClick={()=>setSelected(selected.length?[]:repo.contracts.slice(0,8))}>{selected.length?'Clear':'Select first 8'}</button></div><div className="contract-list">{repo.contracts.map(path=><label key={path} className={selected.includes(path)?'selected':''}><input type="checkbox" checked={selected.includes(path)} onChange={()=>toggle(path)}/><span><FileCode2/><b>{path.split('/').pop()}</b><small>{path}</small></span>{selected.includes(path)&&<Check/>}</label>)}</div><div className="selection-bar"><div><BrainCircuit/><span><b>{selected.length} contracts selected</b><small>Pashov will review these. Sibyl will remember accepted findings.</small></span></div><button className="primary-link" onClick={createWorkspace} disabled={!selected.length||creating}>{creating?<LoaderCircle className="spin"/>:null}{creating?'Creating workspace…':'Create workspace & review'}{!creating&&<ArrowRight/>}</button></div>{error&&<p className="setup-error">{error}</p>}</section>}
    <p className="setup-privacy">Only public repositories are supported in this version. Repository contents are used for the requested security review.</p>
  </main>;
}
