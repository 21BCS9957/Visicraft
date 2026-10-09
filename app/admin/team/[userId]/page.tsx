import { Suspense } from 'react';
import type { Metadata } from 'next';
import { MemberWorkspace } from '@/components/admin/MemberWorkspace';

export const metadata: Metadata = {
  title: 'Team workspace · GoGrowth',
};

export default async function AdminMemberPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  // The workspace reads ?tab= and ?project=.
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#08080a]" />}>
      <MemberWorkspace userId={userId} />
    </Suspense>
  );
}
