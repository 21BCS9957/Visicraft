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
  /** Images made (Playground, Canvas edits, the old tools), from the usage log: deleted ones still count. */
  imagesMade: number;
  /** New videos made (re-made takes of a video are not counted again). */
  videosMade: number;
  /** Credits charged in the last 30 India days, all features, refunds left out. */
  creditsUsed30d: number;
  /** Credits left. */
  balance: number | null;
  lastActiveAt: string | null;
}

export type MemberWithSummary = TeamMember & { summary: TeamMemberSummary };

/** The overview's headline numbers. */
export interface DashboardKpis {
  images7d: number;
  imagesPrev7d: number;
  videos7d: number;
  videosPrev7d: number;
  credits30d: number;
  liveCount: number;
}

/** What the team finished on one day (India time). */
export interface ActivityDay {
  /** YYYY-MM-DD */
  date: string;
  images: number;
  videos: number;
}

/** A team project, for the overview's Projects card and each member's "working on". */
export interface DashboardProject {
  id: string;
  name: string;
  kind: 'image' | 'video';
  coverUrl: string | null;
  userId: string;
  updatedAt: string;
}

/** How the team's generations ended over the last 30 days (images and videos). */
export interface DashboardOutcomes {
  finished: number;
  failed: number;
  cancelled: number;
}

/** A usage period, in India days: today, yesterday, the last 7 or 30 days, or everything so far. */
export type UsageRange = 'today' | 'yesterday' | '7d' | '30d' | 'all';

/** One model's share of what was spent in a period. */
export interface ModelSpend {
  /** Stable key, e.g. "gemini-3-pro-image". */
  key: string;
  name: string;
  /** Whose model it is: Gemini, OpenAI, Google (Veo), BytePlus (Seedance), Anthropic (Claude). */
  maker: string;
  /** Colour group: Gemini images, GPT Image images and videos each have a colour; helpers are "other". */
  group: 'gemini' | 'gpt' | 'video' | 'other';
  images: number;
  /** New videos made. */
  videos: number;
  /** Every video render charged: new videos plus re-made takes (redrafts, upgrades). */
  renders: number;
  credits: number;
  /** What the provider charged, in rupees (an estimate from its prices). */
  costInr: number;
}

/** What was made and spent in a period, by one account or in all. */
export interface UsageCounts {
  images: number;
  /** Images from Gemini's Nano Banana models. */
  gemini: number;
  /** Images from OpenAI's GPT Image models. */
  gpt: number;
  /** New videos made (re-made takes of a video are not counted again). */
  videos: number;
  credits: number;
  costInr: number;
}

export interface UsagePeriod extends UsageCounts {
  /** Team accounts that made something, most images first (the owner's own accounts count in the totals, not here). */
  members: Array<UsageCounts & { userId: string }>;
}

/** Usage and cost from the usage log, refunded work left out. */
export interface DashboardUsage {
  /** Rupees per US dollar used for every estimate. */
  inrPerUsd: number;
  periods: Record<UsageRange, UsagePeriod>;
  /** Credits and cost per model for each period, most spent (rupees) first. */
  byModel: Record<UsageRange, ModelSpend[]>;
}

export interface DashboardOverview {
  domain: string;
  members: Array<MemberWithSummary & { liveCount: number; latestProject: DashboardProject | null }>;
  kpis: DashboardKpis;
  /** The last 14 days, oldest first, today last. */
  activity: ActivityDay[];
  /** The most recently updated projects, newest first. */
  recentProjects: DashboardProject[];
  outcomes30d: DashboardOutcomes;
  usage: DashboardUsage;
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
  width: number | null;
  height: number | null;
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
/** done: finished, with a file to look at. live: in progress now. failed: failed or cancelled. */
export type FeedStatus = 'done' | 'live' | 'failed';

export interface FeedPage {
  items: FeedItem[];
  nextBefore: string | null;
}

/** A Playground run with images still to make: one card on Live. */
export interface LiveRun {
  kind: 'run';
  id: string;
  userId: string;
  createdAt: string;
  projectId: string | null;
  projectName: string | null;
  /** The image model's name. */
  model: string | null;
  size: string | null;
  /** The shape of its images ("9:16"). */
  aspectRatio: string | null;
  total: number;
  done: number;
  /** Being made right now. */
  making: number;
  /** Waiting their turn. */
  waiting: number;
  /** Failed or cancelled. */
  failed: number;
  /** When its first image started (null while none has). */
  startedAt: string | null;
  /** The last time one of its images started or finished. */
  lastActivityAt: string;
  /**
   * Nothing has started or finished for a while: the Playground makes images only while its
   * tab is open, so the rest wait until the person opens the project and resumes them.
   */
  paused: boolean;
  /** Why the waiting images were held back, when the provider said (busy, billing…). */
  waitingNote: string | null;
  /** Short names of the images being made now (the first line of their prompts). */
  makingTitles: string[];
  /** Its newest finished images, newest first. */
  latest: FeedImage[];
}

/** Something in progress: a Playground run, or a video (rendering or waiting for approval). */
export type LiveJob = LiveRun | FeedVideo;

/** What is generating right now (and video plans waiting for approval). */
export interface LiveSnapshot {
  jobs: LiveJob[];
  checkedAt: string;
}
