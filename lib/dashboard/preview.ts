import { useSyncExternalStore } from 'react';
import { previewBundle, previewLibrary, previewProjects } from '@/lib/playground/preview';
import { previewHistory, previewVideoProjects } from '@/lib/video/preview';
import type { LibraryKind } from '@/lib/playground/types';
import type { ActivityDay, ClientProject, ClientSpend, DashboardClient, DashboardClientDetail, DashboardClients, DashboardInsights, DashboardOverview, DashboardProject, DashboardUsage, ModelScore, FeedImage, FeedItem, FeedPage, FeedStatus, FeedType, FeedVideo, LiveJob, LiveRun, LiveSnapshot, ModelSpend, UnsortedProject, UsageCounts, UsageRange } from './types';

/**
 * Development-only sample data for the dashboard (`?previewDashboard=1`), so its pages can be
 * checked without signing in as the owner: four accounts, finished images over several days
 * (one whose file is gone), failed and cancelled ones, live work, and the Studio's sample videos.
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
const SHRUTI = '33333333-3333-4333-8333-333333333333';
const AMEET = '44444444-4444-4444-8444-444444444444';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const PICTURES = [
  '/Youtube%20Template/Youtube_Generated.png',
  '/Youtube%20Template/youtube_Reference.png',
  '/Youtube%20Template/Youtube%20_Source.png',
  'https://cdn.shopify.com/s/files/1/0586/1539/8474/files/90_da4b0dbe-efd0-44fe-a7cf-f39605d40532.jpg',
  'https://cdn.shopify.com/s/files/1/0586/1539/8474/files/91_fb2dd131-c904-44d0-9c78-90b16b097866.jpg',
  'https://cdn.shopify.com/s/files/1/0586/1539/8474/files/93_38a7df80-916e-4047-859f-d8a988d26593.jpg',
];
/** A finished image whose file was deleted: the gallery must drop it. */
const MISSING = '/dashboard-preview-missing-file.png';

const PROMPTS = [
  'Hero shot of the tea box on a dark walnut table, warm diya light, marigold petals, steam rising from a brass cup',
  'Flat lay: the box, loose chamomile, lemongrass stalks and a handwritten "Sleep well" card on linen',
  'The saree draped over a carved wooden jharokha bench in a heritage haveli, late-morning sun on the zari border',
  'Close-up of the zari border, soft side light, shallow depth of field',
  'A cosy bedside scene at night: the box beside a steaming cup and an open book',
  'Minimal studio shot, sage-green seamless background, one hard shadow',
];

const ACTIVITY_IMAGES = [12, 0, 8, 22, 15, 3, 0, 18, 25, 9, 30, 14, 6, 11];
const ACTIVITY_VIDEOS = [0, 0, 1, 0, 2, 0, 0, 1, 0, 0, 3, 1, 0, 2];

function activity(): ActivityDay[] {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
  return ACTIVITY_IMAGES.map((images, index) => ({ date: day.format(new Date(Date.now() - (13 - index) * DAY)), images, videos: ACTIVITY_VIDEOS[index] }));
}

const SAMPLE_PROJECTS: DashboardProject[] = [
  { id: 'preview', name: 'Night Unwind tea — Diwali set', kind: 'image', coverUrl: PICTURES[0], userId: PRIYA, updatedAt: ago(12 * MINUTE) },
  { id: 'preview-2', name: 'Tissue saree — festive shoot', kind: 'image', coverUrl: PICTURES[3], userId: SHRUTI, updatedAt: ago(40 * MINUTE) },
  { id: 'preview-video', name: 'Tissue saree — festive films', kind: 'video', coverUrl: PICTURES[4], userId: PRIYA, updatedAt: ago(HOUR) },
  { id: 'preview-3', name: 'Brew Sage launch', kind: 'image', coverUrl: PICTURES[1], userId: AMEET, updatedAt: ago(2 * DAY) },
  { id: 'preview-video-3', name: 'Lace bralette set', kind: 'video', coverUrl: null, userId: SHRUTI, updatedAt: ago(5 * DAY) },
  { id: 'preview-4', name: 'Brew Sage — monsoon offer', kind: 'image', coverUrl: PICTURES[2], userId: AMEET, updatedAt: ago(6 * DAY) },
];

/** Sample spend per model for one period: the Playground's mix, scaled. */
function sampleSpend(scale: number): ModelSpend[] {
  const rows: Array<Omit<ModelSpend, 'credits' | 'costInr' | 'images' | 'videos' | 'renders'> & { images: number; videos: number; renders?: number; credits: number; inr: number }> = [
    { key: 'gpt-image-2.5-sunburst', name: 'GPT Image 2.5 Sunburst', maker: 'OpenAI', group: 'gpt', images: 519, videos: 0, credits: 18320, inr: 3371 },
    { key: 'gemini-3-pro-image', name: 'Nano Banana Pro', maker: 'Gemini', group: 'gemini', images: 202, videos: 0, credits: 10030, inr: 2382 },
    { key: 'gpt-image-2.5-flare', name: 'GPT Image 2.5 Flare', maker: 'OpenAI', group: 'gpt', images: 126, videos: 0, credits: 3670, inr: 706 },
    { key: 'dreamina-seedance-2-5-260628', name: 'Seedance 2.5', maker: 'BytePlus', group: 'video', images: 0, videos: 3, renders: 5, credits: 640, inr: 980 },
    { key: 'claude', name: 'Claude · prompt writing', maker: 'Anthropic', group: 'other', images: 0, videos: 0, credits: 480, inr: 230 },
    { key: 'gemini-3.1-flash-image', name: 'Nano Banana 2', maker: 'Gemini', group: 'gemini', images: 4, videos: 0, credits: 140, inr: 36 },
  ];
  return rows.map(({ inr, ...row }) => ({
    ...row,
    images: Math.round(row.images * scale),
    videos: Math.round(row.videos * scale),
    renders: Math.round((row.renders ?? row.videos) * scale),
    credits: Math.round(row.credits * scale),
    costInr: Math.round(inr * scale),
  })).filter((row) => row.credits > 0).sort((a, b) => b.costInr - a.costInr);
}

function sampleUsage(): DashboardUsage {
  const scales: Record<UsageRange, number> = { today: 0.06, yesterday: 0.09, '7d': 0.7, '30d': 1, all: 1.25 };
  const people = [
    { userId: PRIYA, images: 24, gemini: 9, gpt: 15, videos: 1, credits: 1310, costInr: 464 },
    { userId: SHRUTI, images: 16, gemini: 3, gpt: 13, videos: 0, credits: 520, costInr: 133 },
    { userId: AMEET, images: 2, gemini: 2, gpt: 0, videos: 0, credits: 100, costInr: 27 },
  ];
  const entries = Object.entries(scales) as Array<[UsageRange, number]>;
  const byModel = Object.fromEntries(entries.map(([range, scale]) => [range, sampleSpend(scale)])) as Record<UsageRange, ModelSpend[]>;
  const periods = Object.fromEntries(entries.map(([range, scale]) => {
    const factor = scale / scales.today;
    const members = people.map((person) => ({
      ...person,
      images: Math.round(person.images * factor),
      gemini: Math.round(person.gemini * factor),
      gpt: Math.round(person.gpt * factor),
      videos: Math.round(person.videos * factor),
      credits: Math.round(person.credits * factor),
      costInr: Math.round(person.costInr * factor),
    }));
    const sum = (key: 'images' | 'gemini' | 'gpt' | 'videos') => members.reduce((total, member) => total + member[key], 0);
    const list = byModel[range];
    return [range, {
      images: sum('images'), gemini: sum('gemini'), gpt: sum('gpt'), videos: sum('videos'),
      credits: list.reduce((total, row) => total + row.credits, 0),
      costInr: list.reduce((total, row) => total + row.costInr, 0),
      members,
    }];
  })) as DashboardUsage['periods'];
  return { inrPerUsd: 99, periods, byModel };
}

/** Sample clients, waste and scorecard: the real mix, scaled per period. */
function sampleInsights(): DashboardInsights {
  const scales: Record<UsageRange, number> = { today: 0.06, yesterday: 0.09, '7d': 0.4, '30d': 1, all: 1.15 };
  const clientRows: ClientSpend[] = [
    { key: CLIENT_BREW, id: CLIENT_BREW, name: 'Brew Sage', projects: ['Night Unwind tea — Diwali set', 'Brew Sage launch', 'Brew Sage — monsoon offer'], userIds: [PRIYA, AMEET], images: 253, videos: 2, credits: 11600, costInr: 4020 },
    { key: CLIENT_TISSUE, id: CLIENT_TISSUE, name: 'Tissue saree', projects: ['Tissue saree — festive shoot', 'Tissue saree — festive films'], userIds: [SHRUTI, PRIYA], images: 168, videos: 3, credits: 7600, costInr: 2950 },
    { key: 'no project', id: null, name: 'No project', projects: ['No project'], userIds: [], images: 60, videos: 4, credits: 2100, costInr: 1880 },
    { key: 'unsorted', id: null, name: 'Unsorted', projects: ['Lace bralette set', 'Thriller', 'Thriller Grip me'], userIds: [SHRUTI, PRIYA], images: 52, videos: 1, credits: 1900, costInr: 660 },
    { key: 'deleted project', id: null, name: 'Deleted project', projects: ['Deleted project'], userIds: [], images: 9, videos: 0, credits: 300, costInr: 95 },
  ];
  const scoreRows: ModelScore[] = [
    { key: 'gpt-image-2.5-sunburst', name: 'GPT Image 2.5 Sunburst', maker: 'OpenAI', group: 'gpt', images: 524, costInr: 3829, costPerImageInr: 7.31, tracked: 524, deleted: 27, favorites: 4, failed: 42, avgSeconds: 42 },
    { key: 'gemini-3-pro-image', name: 'Nano Banana Pro', maker: 'Gemini', group: 'gemini', images: 494, costInr: 6593, costPerImageInr: 13.35, tracked: 284, deleted: 19, favorites: 9, failed: 7, avgSeconds: 27 },
    { key: 'gpt-image-2.5-flare', name: 'GPT Image 2.5 Flare', maker: 'OpenAI', group: 'gpt', images: 126, costInr: 794, costPerImageInr: 6.3, tracked: 126, deleted: 0, favorites: 1, failed: 5, avgSeconds: 24 },
    { key: 'gemini-3.1-flash-image', name: 'Nano Banana 2', maker: 'Gemini', group: 'gemini', images: 9, costInr: 90, costPerImageInr: 10, tracked: 2, deleted: 0, favorites: 0, failed: 0, avgSeconds: 16 },
  ];
  const scale = (value: number, factor: number) => Math.round(value * factor);
  const entries = Object.entries(scales) as Array<[UsageRange, number]>;
  return {
    clients: Object.fromEntries(entries.map(([range, factor]) => [range, clientRows
      .map((row) => ({ ...row, images: scale(row.images, factor), videos: scale(row.videos, factor), credits: scale(row.credits, factor), costInr: scale(row.costInr, factor) }))
      .filter((row) => row.costInr > 0)])) as DashboardInsights['clients'],
    waste: Object.fromEntries(entries.map(([range, factor]) => [range, {
      made: scale(936, factor), deleted: scale(46, factor), deletedCostInr: scale(447, factor), imageCostInr: scale(11306, factor), failed: scale(54, factor),
      members: [
        { userId: SHRUTI, made: scale(542, factor), deleted: scale(27, factor), deletedCostInr: scale(195, factor) },
        { userId: PRIYA, made: scale(310, factor), deleted: scale(12, factor), deletedCostInr: scale(160, factor) },
      ].filter((member) => member.deleted > 0),
    }])) as DashboardInsights['waste'],
    scorecard: Object.fromEntries(entries.map(([range, factor]) => [range, scoreRows
      .map((row) => ({ ...row, images: scale(row.images, factor), costInr: scale(row.costInr, factor), tracked: scale(row.tracked, factor), deleted: scale(row.deleted, factor), favorites: scale(row.favorites, factor), failed: scale(row.failed, factor) }))
      .filter((row) => row.images > 0)])) as DashboardInsights['scorecard'],
  };
}

function overview(): DashboardOverview {
  const days = activity();
  const sum = (list: ActivityDay[], key: 'images' | 'videos') => list.reduce((total, item) => total + item[key], 0);
  const latest = (userId: string) => SAMPLE_PROJECTS.find((project) => project.userId === userId) ?? null;
  return {
    domain: 'gogrowthlabs.com',
    members: [
      {
        id: AMEET, email: 'ameet@gogrowthlabs.com', name: 'Ameet Kumar', avatarUrl: null, createdAt: ago(60 * DAY), lastSignInAt: ago(2 * DAY),
        summary: { imageProjects: 2, videoProjects: 0, imagesMade: 41, videosMade: 0, creditsUsed30d: 900, balance: 2100, lastActiveAt: ago(2 * DAY) },
        liveCount: 0,
        latestProject: latest(AMEET),
      },
      {
        id: PRIYA, email: 'priya@gogrowthlabs.com', name: 'Priya Sharma', avatarUrl: null, createdAt: ago(40 * DAY), lastSignInAt: ago(HOUR),
        summary: { imageProjects: 5, videoProjects: 2, imagesMade: 132, videosMade: 3, creditsUsed30d: 5600, balance: 11347, lastActiveAt: ago(MINUTE) },
        liveCount: 3,
        latestProject: latest(PRIYA),
      },
      {
        id: RAHUL, email: 'rahul@gogrowthlabs.com', name: null, avatarUrl: null, createdAt: ago(20 * DAY), lastSignInAt: ago(5 * DAY),
        summary: { imageProjects: 1, videoProjects: 0, imagesMade: 0, videosMade: 0, creditsUsed30d: 0, balance: 100, lastActiveAt: null },
        liveCount: 0,
        latestProject: null,
      },
      {
        id: SHRUTI, email: 'shruti@gogrowthlabs.com', name: 'Shruti Soni', avatarUrl: null, createdAt: ago(30 * DAY), lastSignInAt: ago(3 * HOUR),
        summary: { imageProjects: 3, videoProjects: 1, imagesMade: 357, videosMade: 0, creditsUsed30d: 3150, balance: 640, lastActiveAt: ago(3 * HOUR) },
        liveCount: 1,
        latestProject: latest(SHRUTI),
      },
    ],
    recentProjects: SAMPLE_PROJECTS,
    outcomes30d: { finished: 489, failed: 32, cancelled: 18 },
    usage: sampleUsage(),
    insights: sampleInsights(),
    kpis: {
      images7d: sum(days.slice(7), 'images'),
      imagesPrev7d: sum(days.slice(0, 7), 'images'),
      videos7d: sum(days.slice(7), 'videos'),
      videosPrev7d: sum(days.slice(0, 7), 'videos'),
      credits30d: 9650,
      liveCount: 4,
    },
    activity: days,
  };
}

/** [who, how long ago, status] for each sample image, newest first. */
const IMAGE_PLAN: Array<[string, number, FeedImage['status']]> = [
  [PRIYA, 2 * MINUTE, 'generating'],
  [PRIYA, 3 * MINUTE, 'queued'],
  [SHRUTI, 6 * MINUTE, 'generating'],
  [SHRUTI, 7 * MINUTE, 'queued'],
  [PRIYA, 12 * MINUTE, 'done'],
  [PRIYA, 13 * MINUTE, 'done'],
  [SHRUTI, 40 * MINUTE, 'done'],
  [SHRUTI, 41 * MINUTE, 'failed'],
  [SHRUTI, 42 * MINUTE, 'done'],
  [PRIYA, 2 * HOUR, 'done'],
  [PRIYA, 2 * HOUR + MINUTE, 'done'],
  [PRIYA, 2 * HOUR + 2 * MINUTE, 'cancelled'],
  [SHRUTI, 5 * HOUR, 'done'],
  [SHRUTI, 5 * HOUR + MINUTE, 'done'],
  [SHRUTI, 26 * HOUR, 'done'],
  [SHRUTI, 26 * HOUR + MINUTE, 'done'],
  [PRIYA, 28 * HOUR, 'done'],
  [PRIYA, 28 * HOUR + MINUTE, 'failed'],
  [PRIYA, 29 * HOUR, 'done'],
  [AMEET, 3 * DAY, 'done'],
  [AMEET, 3 * DAY + MINUTE, 'done'],
  [AMEET, 3 * DAY + 2 * MINUTE, 'done'],
  [SHRUTI, 4 * DAY, 'done'],
  [SHRUTI, 4 * DAY + MINUTE, 'cancelled'],
  [PRIYA, 6 * DAY, 'done'],
  [PRIYA, 6 * DAY + MINUTE, 'done'],
  [PRIYA, 6 * DAY + 2 * MINUTE, 'failed'],
  [AMEET, 9 * DAY, 'done'],
  [AMEET, 9 * DAY + MINUTE, 'done'],
];

const PROJECTS: Record<string, { id: string; name: string }> = {
  [PRIYA]: { id: 'preview', name: 'Night Unwind tea — Diwali set' },
  [SHRUTI]: { id: 'preview-2', name: 'Tissue saree — festive shoot' },
  [AMEET]: { id: 'preview-3', name: 'Brew Sage launch' },
};

function images(): FeedImage[] {
  return IMAGE_PLAN.map(([userId, age, status], index) => {
    const done = status === 'done';
    // The 6th finished image's file was deleted.
    const url = done ? (index === 10 ? MISSING : PICTURES[index % PICTURES.length]) : null;
    const portrait = index % 3 !== 1;
    return {
      kind: 'image' as const,
      id: `preview-image-${index}`,
      userId,
      createdAt: ago(age),
      status,
      url,
      previewUrl: url,
      aspectRatio: portrait ? '4:5' : '1:1',
      width: done ? (portrait ? 1856 : 2048) : null,
      height: done ? (portrait ? 2304 : 2048) : null,
      prompt: PROMPTS[index % PROMPTS.length],
      model: index % 4 === 0 ? 'GPT Image 2.5' : 'Nano Banana Pro',
      size: '2K',
      projectId: PROJECTS[userId]?.id ?? null,
      projectName: PROJECTS[userId]?.name ?? null,
      source: 'playground' as const,
      error: status === 'failed' ? "Gemini's safety filters blocked this image. Try rewording the prompt or using different references." : null,
      startedAt: status === 'queued' ? null : ago(age - 30_000),
    };
  });
}

function videos(): FeedVideo[] {
  return previewHistory().map((video) => ({ kind: 'video' as const, id: video.id, userId: PRIYA, createdAt: video.createdAt, video, projectId: 'preview-video', projectName: 'Tissue saree — festive films' }));
}

function all(): FeedItem[] {
  return [...images(), ...videos()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

const RUN_TITLES = ['Headline', 'Offer / Promotion', 'Testimonial', 'Features / Benefits Point-Out', 'Bundle Showcase'];

/** A sample run for Live: `done` of `total` finished, `making` now, `failed`, the rest waiting. */
function sampleRun(run: { id: string; userId: string; startedAgo: number; idleFor: number; total: number; done: number; making: number; failed: number; ratio: string; model: string; note?: string }): LiveRun {
  const project = PROJECTS[run.userId];
  const portrait = run.ratio !== '1:1';
  const latest: FeedImage[] = Array.from({ length: Math.min(run.done, 12) }, (_, index) => ({
    kind: 'image',
    id: `${run.id}-image-${index}`,
    userId: run.userId,
    createdAt: ago(run.startedAgo),
    status: 'done',
    url: PICTURES[index % PICTURES.length],
    previewUrl: PICTURES[index % PICTURES.length],
    aspectRatio: run.ratio,
    width: portrait ? 1856 : 2048,
    height: portrait ? 2304 : 2048,
    prompt: `${RUN_TITLES[index % RUN_TITLES.length]}\n${PROMPTS[index % PROMPTS.length]}`,
    model: run.model,
    size: '2K',
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    source: 'playground',
    error: null,
    startedAt: ago(run.startedAgo - index * 20_000),
  }));
  const paused = run.idleFor > 6 * MINUTE;
  return {
    kind: 'run',
    id: run.id,
    userId: run.userId,
    createdAt: ago(run.startedAgo + 2_000),
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    model: run.model,
    size: '2K',
    aspectRatio: run.ratio,
    total: run.total,
    done: run.done,
    making: run.making,
    waiting: run.total - run.done - run.making - run.failed,
    failed: run.failed,
    startedAt: ago(run.startedAgo),
    lastActivityAt: ago(run.idleFor),
    paused,
    waitingNote: paused ? run.note ?? null : null,
    makingTitles: RUN_TITLES.slice(0, run.making),
    latest,
  };
}

/** Live: Priya's run in full swing, Shruti's paused (she left the Playground), and Priya's videos. */
function liveJobs(): LiveJob[] {
  const runs = [
    sampleRun({ id: 'preview-run-1', userId: PRIYA, startedAgo: 4 * MINUTE + 40_000, idleFor: 8_000, total: 24, done: 9, making: 3, failed: 1, ratio: '4:5', model: 'GPT Image 2.5 Sunburst' }),
    sampleRun({ id: 'preview-run-2', userId: SHRUTI, startedAgo: 21 * MINUTE, idleFor: 9 * MINUTE, total: 10, done: 6, making: 0, failed: 0, ratio: '1:1', model: 'Nano Banana Pro' }),
  ];
  return [...runs, ...videos().filter(isLive)].sort((a, b) => {
    const paused = (job: LiveJob) => (job.kind === 'run' && job.paused ? 1 : 0);
    return paused(a) - paused(b) || Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

function isLive(item: FeedItem): boolean {
  if (item.kind === 'image') return item.status === 'generating' || item.status === 'queued';
  return Boolean(item.video.review) || item.video.takes.some((take) => take.status === 'rendering');
}

function matches(item: FeedItem, status: FeedStatus): boolean {
  if (status === 'live') return isLive(item);
  if (item.kind === 'image') return status === 'done' ? item.status === 'done' : item.status === 'failed' || item.status === 'cancelled';
  if (isLive(item)) return false;
  const ready = item.video.takes.some((take) => take.status === 'ready');
  return status === 'done' ? ready && !item.video.cancelled : !ready || item.video.cancelled;
}

/* Clients: two set up, the rest waiting to be sorted. Sorting here only changes this copy. */

const CLIENT_BREW = 'aaaaaaaa-0000-4000-8000-000000000001';
const CLIENT_TISSUE = 'aaaaaaaa-0000-4000-8000-000000000002';
const OWNER = '99999999-9999-4999-8999-999999999999';

const clientState = {
  clients: [{ id: CLIENT_BREW, name: 'Brew Sage' }, { id: CLIENT_TISSUE, name: 'Tissue saree' }],
  /** project id → client id. */
  assigned: new Map<string, string>([['preview', CLIENT_BREW], ['preview-3', CLIENT_BREW], ['preview-4', CLIENT_BREW], ['preview-2', CLIENT_TISSUE], ['preview-video', CLIENT_TISSUE]]),
};

/** Every sample project, the sorted and the unsorted, with what each made (all time). */
const CLIENT_PROJECTS: Array<DashboardProject & { images: number; videos: number; costInr: number; suggestion?: string }> = [
  ...SAMPLE_PROJECTS.map((project, index) => ({ ...project, images: [212, 168, 0, 41, 12, 0][index] ?? 0, videos: [0, 0, 3, 0, 1, 0][index] ?? 0, costInr: [3010, 2400, 550, 610, 420, 400][index] ?? 0 })),
  { id: 'preview-thriller', name: 'Thriller', kind: 'image', coverUrl: PICTURES[4], userId: SHRUTI, updatedAt: ago(3 * HOUR), images: 30, videos: 0, costInr: 180, suggestion: 'Thriller' },
  { id: 'preview-thriller-2', name: 'Thriller Grip me', kind: 'image', coverUrl: PICTURES[5], userId: PRIYA, updatedAt: ago(9 * HOUR), images: 10, videos: 0, costInr: 60, suggestion: 'Thriller' },
  { id: 'preview-owner', name: 'Uwears', kind: 'image', coverUrl: null, userId: OWNER, updatedAt: ago(2 * DAY), images: 6, videos: 0, costInr: 45 },
  { id: 'preview-default', name: 'Project 12 Oct', kind: 'image', coverUrl: null, userId: AMEET, updatedAt: ago(4 * DAY), images: 0, videos: 0, costInr: 0 },
];

const PERIOD_SHARE: Record<UsageRange, number> = { today: 0.05, yesterday: 0.08, '7d': 0.4, '30d': 0.85, all: 1 };
const RANGE_LIST = Object.keys(PERIOD_SHARE) as UsageRange[];

function countsOf(projects: typeof CLIENT_PROJECTS, share: number): UsageCounts {
  const images = Math.round(projects.reduce((total, project) => total + project.images, 0) * share);
  const costInr = Math.round(projects.reduce((total, project) => total + project.costInr, 0) * share);
  return { images, gemini: Math.round(images * 0.4), gpt: images - Math.round(images * 0.4), videos: Math.round(projects.reduce((total, project) => total + project.videos, 0) * share), credits: costInr * 3, costInr };
}

function clientsPage(): DashboardClients {
  const clients: DashboardClient[] = clientState.clients.map((client) => {
    const projects = CLIENT_PROJECTS.filter((project) => clientState.assigned.get(project.id) === client.id);
    return {
      ...client,
      coverUrl: projects.find((project) => project.coverUrl)?.coverUrl ?? null,
      projectCount: projects.length,
      userIds: [...new Set(projects.map((project) => project.userId).filter((id) => id !== OWNER))],
      lastActiveAt: projects.map((project) => project.updatedAt).sort().at(-1) ?? null,
      periods: Object.fromEntries(RANGE_LIST.map((range) => [range, countsOf(projects, PERIOD_SHARE[range])])) as Record<UsageRange, UsageCounts>,
    };
  });
  const unsorted: UnsortedProject[] = CLIENT_PROJECTS.filter((project) => !clientState.assigned.has(project.id)).map(({ suggestion, ...project }) => {
    const existing = suggestion ? clientState.clients.find((client) => client.name === suggestion) : undefined;
    return { ...project, ownerAccount: project.userId === OWNER, suggestion: suggestion ? { clientId: existing?.id ?? null, name: suggestion } : null };
  });
  return { clients, unsorted };
}

function clientDetail(clientId: string, person: string | null): DashboardClientDetail {
  const client = clientState.clients.find((known) => known.id === clientId) ?? clientState.clients[0];
  const projects = CLIENT_PROJECTS.filter((project) => clientState.assigned.get(project.id) === client.id && project.userId !== OWNER);
  const peopleIds = [...new Set(projects.map((project) => project.userId))];
  const people = peopleIds.map((userId) => {
    const own = projects.filter((project) => project.userId === userId);
    const counts = countsOf(own, 1);
    return { userId, images: counts.images, videos: counts.videos, costInr: counts.costInr };
  }).sort((a, b) => b.costInr - a.costInr);
  const who = person && peopleIds.includes(person) ? person : null;
  const shown = who ? projects.filter((project) => project.userId === who) : projects;
  const usage = sampleUsage();
  const allCost = usage.periods.all.costInr || 1;
  const share = countsOf(shown, 1).costInr / allCost;
  const scaledUsage: DashboardUsage = {
    ...usage,
    periods: Object.fromEntries(RANGE_LIST.map((range) => {
      const counts = countsOf(shown, PERIOD_SHARE[range]);
      const members = peopleIds.filter((id) => !who || id === who).map((userId) => ({ userId, ...countsOf(shown.filter((project) => project.userId === userId), PERIOD_SHARE[range]) }));
      return [range, { ...counts, members }];
    })) as DashboardUsage['periods'],
    byModel: Object.fromEntries(RANGE_LIST.map((range) => [range, usage.byModel[range].map((model) => ({
      ...model, images: Math.round(model.images * share), videos: Math.round(model.videos * share), renders: Math.round(model.renders * share), credits: Math.round(model.credits * share), costInr: Math.round(model.costInr * share),
    })).filter((model) => model.costInr > 0)])) as DashboardUsage['byModel'],
  };
  return {
    client,
    people,
    person: who,
    usage: scaledUsage,
    projects: shown.map((project): ClientProject => ({ id: project.id, name: project.name, kind: project.kind, coverUrl: project.coverUrl, userId: project.userId, updatedAt: project.updatedAt, images: project.images, videos: project.videos, costInr: project.costInr })),
    projectCount: projects.length,
    lastActiveAt: projects.map((project) => project.updatedAt).sort().at(-1) ?? null,
  };
}

function addClient(name: string) {
  const known = clientState.clients.find((client) => client.name.toLowerCase().replace(/[^a-z0-9]+/g, '') === name.toLowerCase().replace(/[^a-z0-9]+/g, ''));
  if (known) return { client: known, existed: true };
  const client = { id: `aaaaaaaa-0000-4000-8000-${String(Date.now()).slice(-12).padStart(12, '0')}`, name: name.trim() };
  clientState.clients.push(client);
  return { client, existed: false };
}

export const previewDashboard = {
  overview,
  clients: clientsPage,
  client: clientDetail,
  createClient: addClient,
  renameClient: (clientId: string, name: string) => {
    const client = clientState.clients.find((known) => known.id === clientId);
    if (client) client.name = name.trim();
    return { client: client ?? { id: clientId, name } };
  },
  mergeClient: (clientId: string, into: string) => {
    let projects = 0;
    for (const [projectId, id] of clientState.assigned) if (id === clientId) {
      clientState.assigned.set(projectId, into);
      projects += 1;
    }
    clientState.clients = clientState.clients.filter((client) => client.id !== clientId);
    return { projects };
  },
  setProjectClient: (projectId: string, clientId: string | null) => {
    if (clientId) clientState.assigned.set(projectId, clientId);
    else clientState.assigned.delete(projectId);
    return { projectId, clientId };
  },
  sortProjects: (assignments: Array<{ projectId: string; clientId?: string | null; newClient?: string }>) => ({
    sorted: assignments.map((assignment) => {
      const clientId = assignment.clientId ?? addClient(assignment.newClient ?? 'New client').client.id;
      clientState.assigned.set(assignment.projectId, clientId);
      return { projectId: assignment.projectId, clientId };
    }),
  }),
  member: (userId: string) => overview().members.find((known) => known.id === userId) ?? overview().members[0],
  feed: (options: { account?: string | null; project?: string | null; client?: string | null; type?: FeedType; status?: FeedStatus }): FeedPage => ({
    items: all().filter((item) => {
      if (options.account && item.userId !== options.account) return false;
      if (options.project && item.projectId !== options.project) return false;
      if (options.client && clientState.assigned.get(item.projectId ?? '') !== options.client) return false;
      if (options.type === 'image' && item.kind !== 'image') return false;
      if (options.type === 'video' && item.kind !== 'video') return false;
      return matches(item, options.status ?? 'done');
    }),
    nextBefore: null,
  }),
  live: (): LiveSnapshot => ({ jobs: liveJobs(), checkedAt: new Date().toISOString() }),
  projects: (kind: 'image' | 'video') => (kind === 'video' ? previewVideoProjects() : previewProjects()),
  bundle: () => previewBundle(),
  videos: () => ({ videos: previewHistory(), nextBefore: null }),
  library: (kind: LibraryKind) => ({ items: previewLibrary(kind), nextBefore: null, setupMessage: null }),
};
