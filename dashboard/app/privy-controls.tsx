'use client';
import dynamic from 'next/dynamic';

export const PrivyEntryButton = dynamic(
  () => import('./privy-controls-client').then(module => module.PrivyEntryButton),
  { ssr: false, loading: () => <button className="primary-link" disabled>Loading sign-in…</button> },
);
export const PrivyAccount = dynamic(
  () => import('./privy-controls-client').then(module => module.PrivyAccount),
  { ssr: false },
);
