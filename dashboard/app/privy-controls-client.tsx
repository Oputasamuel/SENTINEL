'use client';

import { useLogin, usePrivy, useWallets } from '@privy-io/react-auth';
import { useState, useRef } from 'react';
import { ArrowRight, LogOut, Wallet } from 'lucide-react';

export function PrivyEntryButton({ dashboard = false }: { dashboard?: boolean }) {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const entering = useRef(false);
  const { login } = useLogin({ onComplete: () => { void enter(); }, onError: () => setError('Sign-in could not finish. Please try again.') });
  const { wallets } = useWallets();
  const label = !ready ? 'Loadingâ€¦' : authenticated ? 'Open dashboard' : 'Connect wallet or email';

  async function enter() {
    if (entering.current) return;
    entering.current = true; setBusy(true); setError('');
    try {
    const token = await getAccessToken();
    if (!token) throw new Error('Your sign-in expired. Please sign in again.');
    const response = await fetch('/api/auth/session', {
      method: 'POST', credentials: 'include',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email: user?.email?.address, walletAddress: wallets[0]?.address ?? user?.wallet?.address }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(result.error || 'Could not open your dashboard. Please try again.');
    }
    const target = new URLSearchParams(window.location.search).get('return_to');
    window.location.assign(target && /^\/(?:dashboard(?:\/|\?|$)|connect\?code=[A-Fa-f0-9]{8}$)/.test(target) ? target : '/dashboard');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not connect. Please try again.'); }
    finally { entering.current = false; setBusy(false); }
  }

  return <span><button className="primary-link" type="button" disabled={!ready || busy} onClick={() => authenticated ? void enter() : login()}>{busy ? 'Opening dashboardâ€¦' : dashboard && !authenticated ? 'Sign in to continue' : label}<ArrowRight size={15}/></button>{error && <span role="alert" style={{display:'block',maxWidth:360,color:'#ff9b9b',fontSize:14,marginTop:10}}>{error}</span>}</span>;
}

export function PrivyAccount() {
  const { user, logout } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0]?.address ?? user?.wallet?.address;
  const email = user?.email?.address;
  const label = email ?? (wallet ? `${wallet.slice(0, 6)}â€¦${wallet.slice(-4)}` : 'Privy account');
  async function signOut() {
    await fetch('/api/auth/session', { method: 'DELETE', credentials: 'include' });
    await logout();
    window.location.assign('/');
  }
  return <div className="side-user"><span><Wallet size={16}/></span><div><b>{label}</b><small>{wallet ? `${wallet.slice(0, 8)}â€¦${wallet.slice(-6)}` : 'Embedded wallet ready'}</small></div><button type="button" onClick={signOut} aria-label="Sign out"><LogOut size={15}/></button></div>;
}
