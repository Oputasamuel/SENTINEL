'use client';

import { PrivyProvider } from '@privy-io/react-auth';

export function SentinelPrivyProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) return <div className="auth-config-error">SENTINEL sign-in is being configured.</div>;

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['email', 'wallet'],
        appearance: {
          theme: 'dark',
          accentColor: '#25d0b1',
          logo: '/favicon.svg',
          showWalletLoginFirst: true,
          walletList: ['metamask', 'coinbase_wallet', 'rainbow', 'wallet_connect'],
        },
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
