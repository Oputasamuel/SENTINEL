import type { Metadata } from 'next';
import './globals.css';
import { SentinelPrivyProvider } from './privy-provider';
export const metadata: Metadata = {
  title: 'SENTINEL — Smart-contract vulnerability tracking',
  description: 'Review selected Solidity contracts, remember confirmed vulnerabilities, and check whether later changes fix or reintroduce them.',
  openGraph: { title: 'SENTINEL', description: 'Find vulnerabilities and track what happens next.', images: ['/og.png'] },
  twitter: { card: 'summary_large_image', title: 'SENTINEL', description: 'Find it. Remember it. Check the fix.', images: ['/og.png'] },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="dark"><body><SentinelPrivyProvider>{children}</SentinelPrivyProvider></body></html>;
}


