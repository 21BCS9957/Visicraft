import type { Metadata } from 'next';
import { TeamPage } from '@/components/admin/TeamPage';

export const metadata: Metadata = {
  title: 'Team workspaces · GoGrowth',
};

export default function AdminTeamPage() {
  return <TeamPage />;
}
