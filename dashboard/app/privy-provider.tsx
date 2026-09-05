'use client';
import dynamic from 'next/dynamic';

export const SentinelPrivyProvider = dynamic(
  () => import('./privy-provider-client').then(module => module.SentinelPrivyProvider),
  { ssr: false, loading: () => <main className="auth-gate" role="status">Loading SENTINEL…</main> },
);
