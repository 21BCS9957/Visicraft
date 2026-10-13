import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AccountWorkspace } from '@/components/dashboard/AccountWorkspace';

export const metadata: Metadata = {
  title: 'Account · GoGrowth dashboard',
};

/** dashboard.<domain>/accounts/<id> (proxy.ts rewrites it here). */
export default async function DashboardAccountPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  // The account page reads ?tab= and ?project=.
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0b]" />}>
      <AccountWorkspace userId={userId} />
    </Suspense>
  );
}
