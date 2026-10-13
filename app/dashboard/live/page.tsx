import type { Metadata } from 'next';
import { LivePage } from '@/components/dashboard/LiveList';

export const metadata: Metadata = {
  title: 'Live · GoGrowth dashboard',
};

/** dashboard.<domain>/live (proxy.ts rewrites it here). */
export default function DashboardLivePage() {
  return <LivePage />;
}
