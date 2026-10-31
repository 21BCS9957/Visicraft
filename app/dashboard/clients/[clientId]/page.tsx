import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ClientWorkspace } from '@/components/dashboard/ClientWorkspace';

export const metadata: Metadata = {
  title: 'Client · GoGrowth dashboard',
};

/** dashboard.<domain>/clients/<id> (proxy.ts rewrites it here). */
export default async function DashboardClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  // The client page reads ?person=, ?period= and ?tab=.
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0b]" />}>
      <ClientWorkspace clientId={clientId} />
    </Suspense>
  );
}
