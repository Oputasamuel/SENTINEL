'use client';
import { useState } from 'react';
import { LoaderCircle, Plus, X } from 'lucide-react';

export default function ManualFinding({ workspaceId, contracts }: { workspaceId: string; contracts: string[] }) {
  const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/workspaces/${workspaceId}/findings`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(Object.fromEntries(data)) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || 'Could not save finding.'); setSaving(false); return; }
    window.location.reload();
  }
  if (!open) return <button className="outline-link" onClick={()=>setOpen(true)}><Plus/>Add manual finding</button>;
  return <div className="finding-modal"><form onSubmit={submit}><button type="button" className="modal-close" onClick={()=>setOpen(false)}><X/></button><span className="eyebrow">MANUAL FINDING</span><h2>Add what you found</h2><label>Title<input name="title" required maxLength={300} placeholder="e.g. Missing access control on emergencyWithdraw"/></label><label>Contract<select name="contract" required>{contracts.map(path=><option key={path}>{path}</option>)}</select></label><label>Severity<select name="severity" defaultValue="high"><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label><label>What is vulnerable?<textarea name="description" required maxLength={5000} placeholder="Describe the vulnerable behavior, attack conditions, and expected fix."/></label>{error&&<p className="setup-error">{error}</p>}<button className="primary-link" disabled={saving}>{saving?<LoaderCircle className="spin"/>:<Plus/>}{saving?'Saving…':'Save finding'}</button></form></div>;
}
