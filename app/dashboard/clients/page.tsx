import type { Metadata } from 'next';
import { ClientsPage } from '@/components/dashboard/ClientsPage';

export const metadata: Metadata = {
  title: 'Clients · GoGrowth dashboard',
};

/** dashboard.<domain>/clients (proxy.ts rewrites it here). */
export default function DashboardClientsPage() {
  return <ClientsPage />;
}
