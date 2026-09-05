'use client';

import { usePrivy } from '@privy-io/react-auth';
import { BrainCircuit, LoaderCircle, Wallet } from 'lucide-react';

export function PrivyGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login } = usePrivy();
  if (!ready) return <main className="auth-gate"><LoaderCircle className="spin"/><p>Loading your SENTINEL account…</p></main>;
  if (!authenticated) return <main className="auth-gate"><BrainCircuit size={36}/><span className="eyebrow">SENTINEL ACCESS</span><h1>Connect to your security workspace.</h1><p>Use your email or wallet. Privy creates a secure Base wallet when you do not already have one.</p><button className="primary-link" type="button" onClick={login}><Wallet size={16}/>Connect wallet or email</button><a href="/">Back to SENTINEL</a></main>;
  return <>{children}</>;
}
