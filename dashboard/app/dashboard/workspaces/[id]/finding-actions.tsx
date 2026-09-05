'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function FindingActions({ workspaceId, findingId, status }: { workspaceId:string; findingId:string; status:string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  async function decide(nextStatus: string) {
    setSaving(true);
    const response = await fetch(`/api/workspaces/${workspaceId}/findings/${findingId}`, { method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify({status:nextStatus}) });
    setSaving(false);
    if (response.ok) router.refresh();
  }
  return <div className="finding-actions">
    <button disabled={saving || status === 'confirmed'} onClick={()=>decide('confirmed')}>Confirm</button>
    <button disabled={saving || status === 'dismissed'} onClick={()=>decide('dismissed')}>Dismiss</button>
    <button disabled={saving || status === 'fixed'} onClick={()=>decide('fixed')}>Mark fixed</button>
  </div>;
}
