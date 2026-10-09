import { previewBundle, previewLibrary, previewProjects } from '@/lib/playground/preview';
import { previewHistory, previewVideoProjects } from '@/lib/video/preview';
import type { LibraryKind } from '@/lib/playground/types';
import type { TeamOverview } from './types';

/**
 * Development-only sample data for the admin's team view (`?previewAdmin=1`), so its pages can
 * be checked without signing in as the admin. Built from the Playground and Studio samples.
 */
export function isAdminPreview(): boolean {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('previewAdmin');
}

const now = Date.now();
const ago = (ms: number) => new Date(now - ms).toISOString();

export function previewTeam(): TeamOverview {
  return {
    domain: 'gogrowthlabs.com',
    members: [
      {
        id: '11111111-1111-4111-8111-111111111111', email: 'priya@gogrowthlabs.com', name: 'Priya Sharma', avatarUrl: null, createdAt: ago(40 * 86_400_000), lastSignInAt: ago(3_600_000),
        summary: { imageProjects: 5, videoProjects: 2, imagesMade: 132, videosMade: 6, creditsUsed30d: 5600, lastActiveAt: ago(1_800_000) },
      },
      {
        id: '22222222-2222-4222-8222-222222222222', email: 'rahul@gogrowthlabs.com', name: null, avatarUrl: null, createdAt: ago(20 * 86_400_000), lastSignInAt: ago(5 * 86_400_000),
        summary: { imageProjects: 1, videoProjects: 0, imagesMade: 0, videosMade: 0, creditsUsed30d: 0, lastActiveAt: null },
      },
    ],
  };
}

export const previewAdmin = {
  member: (userId: string) => {
    const member = previewTeam().members.find((known) => known.id === userId) ?? previewTeam().members[0];
    return member;
  },
  projects: (kind: 'image' | 'video') => (kind === 'video' ? previewVideoProjects() : previewProjects()),
  bundle: () => previewBundle(),
  videos: () => ({ videos: previewHistory(), nextBefore: null }),
  library: (kind: LibraryKind) => ({ items: previewLibrary(kind), nextBefore: null, setupMessage: null }),
};
