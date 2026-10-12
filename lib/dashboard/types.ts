import type { StudioVideo } from '@/lib/video/shared';

/** A GoGrowth team account the dashboard shows (read-only). */
export interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
  lastSignInAt: string | null;
}

/** What an account has made. */
export interface TeamMemberSummary {
  imageProjects: number;
  videoProjects: number;
  /** Finished Playground images. */
  imagesMade: number;
  /** Videos planned or rendered (each with its takes). */
  videosMade: number;
  /** Credits charged in the last 30 days, all features. */
  creditsUsed30d: number;
  /** Credits left. */
  balance: number | null;
  lastActiveAt: string | null;
}

export type MemberWithSummary = TeamMember & { summary: TeamMemberSummary };

export interface DashboardOverview {
  domain: string;
  members: Array<MemberWithSummary & { liveCount: number }>;
}

/** An image in the feed: a Playground image, or a quick generation from the old tools. */
export interface FeedImage {
  kind: 'image';
  id: string;
  userId: string;
  createdAt: string;
  status: 'done' | 'failed' | 'generating' | 'queued' | 'cancelled';
  url: string | null;
  previewUrl: string | null;
  aspectRatio: string | null;
  prompt: string | null;
  /** The image model's name. */
  model: string | null;
  size: string | null;
  projectId: string | null;
  projectName: string | null;
  source: 'playground' | 'quick';
  error: string | null;
  startedAt: string | null;
}

/** A video in the feed, with its takes. */
export interface FeedVideo {
  kind: 'video';
  id: string;
  userId: string;
  createdAt: string;
  video: StudioVideo;
  projectId: string | null;
  projectName: string | null;
}

export type FeedItem = FeedImage | FeedVideo;

export type FeedType = 'all' | 'image' | 'video';
export type FeedStatus = 'all' | 'done' | 'failed' | 'live';

export interface FeedPage {
  items: FeedItem[];
  nextBefore: string | null;
}

/** What is generating right now (and video plans waiting for approval). */
export interface LiveSnapshot {
  items: FeedItem[];
  checkedAt: string;
}
