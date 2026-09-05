import { requireSentinelUser } from '@/app/sentinel-auth';
import './console.css';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireSentinelUser('/dashboard');
  return <div className="sentinel-console">{children}</div>;
}
