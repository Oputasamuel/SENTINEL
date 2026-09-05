import { requireChatGPTUser } from '@/app/chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Connect({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code = '' } = await searchParams;
  return <Approve code={code.toUpperCase()} />;
}
async function Approve({ code }: { code: string }) {
  await requireChatGPTUser('/connect?code=' + encodeURIComponent(code));
  return <main className="docs-page connect-page"><a className="brand" href="/">sentinel</a><div className="panel connect-panel"><span className="eyebrow">LINK YOUR TERMINAL</span><h1>Approve this CLI session?</h1><p>Only approve if you just ran <code>sentinel login</code> and this code matches your terminal.</p><div className="device-code">{code || 'No code supplied'}</div><p>The CLI can upload review summaries to your account. Your LLM key stays on your device. You can revoke access from the dashboard.</p><form action="/api/cli/authorize" method="post"><input type="hidden" name="code" value={code} /><button className="primary-link" disabled={!/^[A-F0-9]{8}$/.test(code)}>Approve matching code</button><a href="/dashboard">Cancel</a></form></div></main>;
}

