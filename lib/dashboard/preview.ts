import { useSyncExternalStore } from 'react';
import { previewBundle, previewLibrary, previewProjects } from '@/lib/playground/preview';
import { previewHistory, previewVideoProjects } from '@/lib/video/preview';
import type { LibraryKind } from '@/lib/playground/types';
import type { DashboardOverview, FeedImage, FeedItem, FeedPage, FeedStatus, FeedType, LiveSnapshot } from './types';

/**
 * Development-only sample data for the dashboard (`?previewDashboard=1`), so its pages can be
 * checked without signing in as the owner. Built from the Playground and Studio samples.
 */
export function isDashboardPreview(): boolean {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('previewDashboard');
}

const unchanging = () => () => {};

/** The preview flag for rendering: false on the server and during hydration, then the real value. */
export function useDashboardPreview(): boolean {
  return useSyncExternalStore(unchanging, isDashboardPreview, () => false);
}

const PRIYA = '11111111-1111-4111-8111-111111111111';
const RAHUL = '22222222-2222-4222-8222-222222222222';
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function overview(): DashboardOverview {
  return {
    domain: 'gogrowthlabs.com',
    members: [
      {
        id: PRIYA, email: 'priya@gogrowthlabs.com', name: 'Priya Sharma', avatarUrl: null, createdAt: ago(40 * 86_400_000), lastSignInAt: ago(3_600_000),
        summary: { imageProjects: 5, videoProjects: 2, imagesMade: 132, videosMade: 6, creditsUsed30d: 5600, balance: 11347, lastActiveAt: ago(60_000) },
        liveCount: 3,
      },
      {
        id: RAHUL, email: 'rahul@gogrowthlabs.com', name: null, avatarUrl: null, createdAt: ago(20 * 86_400_000), lastSignInAt: ago(5 * 86_400_000),
        summary: { imageProjects: 1, videoProjects: 0, imagesMade: 0, videosMade: 0, creditsUsed30d: 0, balance: 100, lastActiveAt: null },
        liveCount: 0,
      },
    ],
  };
}

function images(): FeedImage[] {
  const bundle = previewBundle();
  const run = bundle.runs[0];
  return bundle.items.map((item, index) => ({
    kind: 'image' as const,
    id: item.id,
    userId: index % 3 === 2 ? RAHUL : PRIYA,
    createdAt: item.createdAt,
    status: item.status === 'done' || item.status === 'failed' || item.status === 'generating' || item.status === 'queued' || item.status === 'cancelled' ? item.status : 'queued',
    url: item.imageUrl,
    previewUrl: item.previewUrl,
    aspectRatio: item.aspectRatio,
    prompt: run?.prompts[item.promptIndex ?? 0] ?? null,
    model: 'Nano Banana Pro',
    size: '2K',
    projectId: bundle.project.id,
    projectName: bundle.project.name,
    source: 'playground' as const,
    error: item.error,
    startedAt: item.startedAt,
  }));
}

function videos(): FeedItem[] {
  return previewHistory().map((video) => ({ kind: 'video' as const, id: video.id, userId: PRIYA, createdAt: video.createdAt, video, projectId: 'preview-video', projectName: 'Tissue saree — festive films' }));
}

function all(): FeedItem[] {
  return [...images(), ...videos()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function isLive(item: FeedItem): boolean {
  if (item.kind === 'image') return item.status === 'generating' || item.status === 'queued';
  return Boolean(item.video.review) || item.video.takes.some((take) => take.status === 'rendering');
}

export const previewDashboard = {
  overview,
  member: (userId: string) => overview().members.find((known) => known.id === userId) ?? overview().members[0],
  feed: (options: { account?: string | null; type?: FeedType; status?: FeedStatus }): FeedPage => ({
    items: all().filter((item) => {
      if (options.account && item.userId !== options.account) return false;
      if (options.type === 'image' && item.kind !== 'image') return false;
      if (options.type === 'video' && item.kind !== 'video') return false;
      if (options.status === 'live') return isLive(item);
      if (options.status === 'failed') return item.kind === 'image' ? item.status === 'failed' : item.video.takes.some((take) => take.status === 'failed') || item.video.cancelled;
      if (options.status === 'done') return item.kind === 'image' ? item.status === 'done' : item.video.takes.some((take) => take.status === 'ready');
      return true;
    }),
    nextBefore: null,
  }),
  live: (account?: string | null): LiveSnapshot => ({ items: all().filter((item) => isLive(item) && (!account || item.userId === account)), checkedAt: new Date().toISOString() }),
  projects: (kind: 'image' | 'video') => (kind === 'video' ? previewVideoProjects() : previewProjects()),
  bundle: () => previewBundle(),
  videos: () => ({ videos: previewHistory(), nextBefore: null }),
  library: (kind: LibraryKind) => ({ items: previewLibrary(kind), nextBefore: null, setupMessage: null }),
};
