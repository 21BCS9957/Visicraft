import type { Metadata } from 'next';
import { DashboardOverviewPage } from '@/components/dashboard/Overview';

export const metadata: Metadata = {
  title: 'Dashboard · GoGrowth',
};

/** Served at the root of dashboard.<domain> (proxy.ts rewrites it here). */
export default function DashboardPage() {
  return <DashboardOverviewPage />;
}
