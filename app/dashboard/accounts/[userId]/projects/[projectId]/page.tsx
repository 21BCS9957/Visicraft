import type { Metadata } from 'next';
import { ProjectViewer } from '@/components/dashboard/ProjectViewer';

export const metadata: Metadata = {
  title: 'Project · GoGrowth dashboard',
};

/** dashboard.<domain>/accounts/<id>/projects/<id> (proxy.ts rewrites it here): a member's project, view only. */
export default async function DashboardProjectPage({ params }: { params: Promise<{ userId: string; projectId: string }> }) {
  const { userId, projectId } = await params;
  return <ProjectViewer userId={userId} projectId={projectId} />;
}
