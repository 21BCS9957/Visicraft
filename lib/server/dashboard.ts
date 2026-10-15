import 'server-only';

import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { ApiError, withUser } from '@/lib/server/playground/http';
import { loadVideosOf } from '@/lib/server/videoHistory';
import { isPlaygroundModel, playgroundModel } from '@/lib/playground/models';
import { studioVideoStatus, type StudioVideo } from '@/lib/video/shared';
import { seedanceSpec } from '@/lib/videoModels';
import type {
  ActivityDay,
  ClientSpend,
  DashboardInsights,
  DashboardOutcomes,
  DashboardOverview,
  DashboardProject,
  DashboardUsage,
  FeedImage,
  FeedItem,
  FeedPage,
  FeedStatus,
  FeedType,
  LiveJob,
  LiveRun,
  LiveSnapshot,
  ModelScore,
  ModelSpend,
  TeamMember,
  TeamMemberSummary,
  UsageCounts,
  UsagePeriod,
  UsageRange,
  WasteSummary,
} from '@/lib/dashboard/types';

/**
 * The GoGrowth dashboard (dashboard.<domain>): only the owner's Google account can open it,
 * and it shows, read-only, every confirmed account at the team's domain: what they have made
 * and what is generating right now. Nothing here writes, charges, refunds or polls a render.
 */

export const DASHBOARD_OWNER_EMAIL = 'gogrowthsoftware@gmail.com';
export const TEAM_DOMAIN = 'gogrowthlabs.com';

type Db = ReturnType<typeof createServiceClient>;
type Row = Record<string, unknown>;

/** An image model's name; an id the Playground doesn't list is shown as it is. */
const modelName = (id: unknown) => (typeof id === 'string' && id ? (isPlaygroundModel(id) ? playgroundModel(id).name : id) : null);

export function isOwnerEmail(email?: string | null): boolean {
  return (email ?? '').trim().toLowerCase() === DASHBOARD_OWNER_EMAIL;
}

/** Exactly name@gogrowthlabs.com (not a subdomain, not a lookalike). */
export function isTeamEmail(email?: string | null): boolean {
  const value = (email ?? '').trim().toLowerCase();
  const at = value.indexOf('@');
  return at > 0 && at === value.lastIndexOf('@') && value.slice(at + 1) === TEAM_DOMAIN;
}

const NOT_OWNER = 'This dashboard is only for GoGrowth’s owner account.';

/**
 * The signed-in owner. The address is checked on the account itself (not only the sign-in
 * token) and must be confirmed, so an unconfirmed sign-up with that address gets nothing.
 */
export async function requireDashboardOwner(request: NextRequest): Promise<User> {
  const user = await withUser(request);
  if (!isOwnerEmail(user.email)) throw new ApiError(403, NOT_OWNER, 'forbidden');
  const { data, error } = await createServiceClient().auth.admin.getUserById(user.id);
  if (error || !data.user?.email_confirmed_at || !isOwnerEmail(data.user.email)) throw new ApiError(403, NOT_OWNER, 'forbidden');
  return user;
}

function toMember(user: User): TeamMember {
  const meta = (user.user_metadata ?? {}) as Row;
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  return {
    id: user.id,
    email: (user.email ?? '').toLowerCase(),
    name: text(meta.full_name) ?? text(meta.name),
    avatarUrl: text(meta.avatar_url) ?? text(meta.picture),
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}

/** Every confirmed account at the team's domain, by email. */
export async function listTeamMembers(): Promise<TeamMember[]> {
  const admin = createServiceClient();
  const members: TeamMember[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new ApiError(502, 'Could not load the team.', 'upstream');
    for (const user of data.users) {
      if (user.email_confirmed_at && isTeamEmail(user.email)) members.push(toMember(user));
    }
    if (data.users.length < 1000) break;
  }
  return members.sort((a, b) => a.email.localeCompare(b.email));
}

/** A team account by id; anything else (another account, a made-up id) is "not found". */
export async function requireTeamMember(userId: string): Promise<TeamMember> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new ApiError(404, 'This account was not found.', 'not_found');
  const { data, error } = await createServiceClient().auth.admin.getUserById(userId);
  if (error || !data.user?.email_confirmed_at || !isTeamEmail(data.user.email)) {
    throw new ApiError(404, 'This account was not found.', 'not_found');
  }
  return toMember(data.user);
}

const VIDEO_MODES = ['video_review', 'product_video_ad', 'img2vid'];
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
/** How long an image, a video render and a plan awaiting approval count as live. */
const LIVE_IMAGE_MS = 30 * MINUTE;
const LIVE_RENDER_MS = 2 * 60 * MINUTE;
const LIVE_REVIEW_MS = DAY;
/**
 * A run is generating while one of its images started or finished in the last 6 minutes (one
 * image takes 5 at most); after that it is paused (its tab was left), and it leaves Live once
 * nothing has moved for 30.
 */
const RUN_ACTIVE_MS = 6 * MINUTE;
const RUN_PAUSED_MS = 30 * MINUTE;
/** The oldest run Live looks at (a run of 200 images takes about an hour). */
const RUN_LOOKBACK_MS = 12 * 60 * MINUTE;
const LIVE_RUNS = 12;
const LATEST_PER_RUN = 12;

/**
 * What an account has made: projects, images and new videos made (from the usage log, so
 * deleted images still count, as everywhere on the dashboard), credits spent in the last 30
 * days, balance and last activity. The overview passes its `usage` so the log is read once.
 */
export async function memberSummary(userId: string, usage?: UsageEntry[]): Promise<TeamMemberSummary> {
  const db = createServiceClient();
  const count = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await query;
    return error ? 0 : n ?? 0;
  };
  const [imageProjects, videoProjects, entries, credits] = await Promise.all([
    count(db.from('playground_projects').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'image')),
    count(db.from('playground_projects').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'video')),
    usage ? Promise.resolve(usage.filter((entry) => entry.userId === userId)) : usageEntries(db, [userId]),
    db.from('user_credits').select('credits').eq('user_id', userId).maybeSingle(),
  ]);
  const month = lastIndiaDays(30);
  const sum = (key: 'images' | 'videos') => entries.reduce((total, entry) => total + entry[key], 0);
  const last = entries.at(-1);
  return {
    imageProjects,
    videoProjects,
    imagesMade: sum('images'),
    videosMade: sum('videos'),
    creditsUsed30d: entries.filter((entry) => month.has(entry.day)).reduce((total, entry) => total + entry.credits, 0),
    balance: typeof credits.data?.credits === 'number' ? credits.data.credits : null,
    lastActiveAt: last ? new Date(last.at).toISOString() : null,
  };
}

/* ------------------------------------------------------------------ the feed */

const ITEM_FEED_COLUMNS = 'id, user_id, project_id, run_id, kind, status, image_url, preview_url, aspect_ratio, width, height, prompt_index, error, created_at, started_at, playground_runs(prompts, model, image_size), playground_projects(name)';

const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);

function feedImageOf(row: Row): FeedImage {
  const run = (row.playground_runs && typeof row.playground_runs === 'object' ? row.playground_runs : null) as Row | null;
  const project = (row.playground_projects && typeof row.playground_projects === 'object' ? row.playground_projects : null) as Row | null;
  const prompts = Array.isArray(run?.prompts) ? (run.prompts as unknown[]).filter((p): p is string => typeof p === 'string') : [];
  const index = typeof row.prompt_index === 'number' ? row.prompt_index : 0;
  const status = String(row.status);
  return {
    kind: 'image',
    id: String(row.id),
    userId: String(row.user_id),
    createdAt: String(row.created_at),
    status: (['done', 'failed', 'generating', 'queued', 'cancelled'].includes(status) ? status : 'queued') as FeedImage['status'],
    url: (row.image_url as string | null) ?? null,
    previewUrl: (row.preview_url as string | null) ?? null,
    aspectRatio: (row.aspect_ratio as string | null) ?? null,
    width: number(row.width),
    height: number(row.height),
    prompt: prompts[index] ?? prompts[0] ?? (row.kind === 'edit' ? 'Edited in Canvas' : null),
    model: modelName(run?.model),
    size: (run?.image_size as string | null) ?? null,
    projectId: (row.project_id as string | null) ?? null,
    projectName: (project?.name as string | null) ?? null,
    source: 'playground',
    error: (row.error as string | null) ?? null,
    startedAt: (row.started_at as string | null) ?? null,
  };
}

function quickImageOf(row: Row): FeedImage | null {
  const thumbs = Array.isArray(row.generated_thumbnails) ? (row.generated_thumbnails as unknown[]).filter((u): u is string => typeof u === 'string') : [];
  if (!thumbs.length) return null;
  return {
    kind: 'image',
    id: `quick-${String(row.id)}`,
    userId: String(row.user_id),
    createdAt: String(row.created_at),
    status: 'done',
    url: thumbs[0],
    previewUrl: thumbs[0],
    aspectRatio: (row.aspect_ratio as string | null) ?? null,
    width: null,
    height: null,
    prompt: (row.prompt as string | null) ?? null,
    model: modelName(row.model),
    size: (row.resolution as string | null) ?? null,
    projectId: null,
    projectName: thumbs.length > 1 ? `Quick generation · ${thumbs.length} images` : 'Quick generation',
    source: 'quick',
    error: null,
    startedAt: null,
  };
}

async function projectNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data } = await db.from('playground_projects').select('id, name').in('id', unique);
  return new Map(((data ?? []) as Row[]).map((row) => [String(row.id), String(row.name)]));
}

/*
 * Feed order and paging. A run's images share one created_at to the microsecond, so a page
 * can't end at a time alone (the rest of that run would be skipped): the order is newest
 * first, then by source (Playground images, quick generations, videos), then id descending,
 * and the cursor names all three.
 */

const SOURCE_RANK = { playground: 0, quick: 1, video: 2 } as const;
type Cursor = { at: string; rank: number; id: string };

const rankOf = (item: FeedItem) => (item.kind === 'video' ? SOURCE_RANK.video : SOURCE_RANK[item.source]);
const rawId = (item: FeedItem) => (item.kind === 'image' && item.source === 'quick' ? item.id.replace(/^quick-/, '') : item.id);

/** A timestamp as a number to the microsecond (Date.parse stops at the millisecond). */
function instant(iso: string): number {
  const fraction = /\.(\d+)/.exec(iso)?.[1] ?? '';
  return Date.parse(iso) * 1000 + Number(fraction.padEnd(6, '0').slice(3, 6));
}

function compareFeed(a: FeedItem, b: FeedItem): number {
  const [idA, idB] = [rawId(a), rawId(b)];
  return instant(b.createdAt) - instant(a.createdAt) || rankOf(a) - rankOf(b) || (idA < idB ? 1 : idA > idB ? -1 : 0);
}

const cursorOf = (item: FeedItem) => `${item.createdAt}~${rankOf(item)}~${rawId(item)}`;

// Only a plain ISO timestamp: it goes into a PostgREST filter.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

/** "time~source~id"; a bare time (an older link) means everything strictly older. */
function parseCursor(value: string | null | undefined): Cursor | null {
  if (!value) return null;
  const [at, rank, id] = value.split('~');
  if (!at || !TIMESTAMP.test(at) || Number.isNaN(Date.parse(at))) return null;
  if (rank === undefined || !/^[0-9a-f-]{36}$/i.test(id ?? '')) return { at, rank: Number.POSITIVE_INFINITY, id: '' };
  return { at, rank: Number(rank), id };
}

interface Pageable<T> {
  lt(column: string, value: string): T;
  lte(column: string, value: string): T;
  or(filters: string): T;
}

/** Rows of one source that come after the cursor, in feed order. */
function afterCursor<T extends Pageable<T>>(query: T, cursor: Cursor | null, rank: number): T {
  if (!cursor) return query;
  // An earlier source at the cursor's instant was all shown; a later one not yet.
  if (rank < cursor.rank) return query.lt('created_at', cursor.at);
  if (rank > cursor.rank) return query.lte('created_at', cursor.at);
  return query.or(`created_at.lt."${cursor.at}",and(created_at.eq."${cursor.at}",id.lt.${cursor.id})`);
}

type FeedOptions = { status: FeedStatus; project?: string | null; cursor: Cursor | null; limit: number };

/** Team images (Playground and quick generations), newest first. */
async function feedImages(db: Db, userIds: string[], options: FeedOptions) {
  const items = () => {
    let query = db.from('playground_items').select(ITEM_FEED_COLUMNS).in('user_id', userIds)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(options.limit + 1);
    if (options.status === 'done') query = query.eq('status', 'done');
    else if (options.status === 'failed') query = query.in('status', ['failed', 'cancelled']);
    else query = query.in('status', ['generating', 'queued']).gte('created_at', new Date(Date.now() - LIVE_IMAGE_MS).toISOString());
    if (options.project) query = query.eq('project_id', options.project);
    return afterCursor(query, options.cursor, SOURCE_RANK.playground);
  };
  // Quick generations have no project and are only ever finished.
  const quick = () => {
    const query = db.from('generations').select('id, user_id, generated_thumbnails, prompt, model, aspect_ratio, resolution, created_at').in('user_id', userIds)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(options.limit + 1);
    return afterCursor(query, options.cursor, SOURCE_RANK.quick);
  };
  const [playground, generations] = await Promise.all([
    items(),
    options.status === 'done' && !options.project ? quick() : Promise.resolve({ data: [] as Row[], error: null }),
  ]);
  if (playground.error) throw new ApiError(500, 'Could not load the images.', 'db');
  return {
    items: [
      ...((playground.data ?? []) as unknown as Row[]).map(feedImageOf),
      ...((generations.data ?? []) as Row[]).map(quickImageOf).filter((item): item is FeedImage => item !== null),
    ],
    more: (playground.data?.length ?? 0) > options.limit || (generations.data?.length ?? 0) > options.limit,
  };
}

/** A video in progress: a render started in the last 2 hours, or a plan waiting (a day at most) for approval. */
function isLiveVideo(video: StudioVideo, now: number): boolean {
  const state = studioVideoStatus(video);
  if (state === 'review') return now - Date.parse(video.createdAt) < LIVE_REVIEW_MS;
  if (state !== 'rendering') return false;
  return video.takes.some((take) => take.status === 'rendering' && now - Date.parse(take.createdAt) < LIVE_RENDER_MS);
}

function videoMatches(status: FeedStatus, video: StudioVideo, now: number): boolean {
  const state = studioVideoStatus(video);
  if (status === 'done') return state === 'ready';
  if (status === 'failed') return state === 'failed' || state === 'cancelled' || state === 'unsaved';
  return isLiveVideo(video, now);
}

/**
 * Team videos, newest first. Videos come last at an instant and two never share one, so a
 * time alone pages them (strictly older than the cursor's time).
 */
async function feedVideos(db: Db, userIds: string[], options: FeedOptions) {
  const { entries, nextBefore } = await loadVideosOf(db, userIds, { projectId: options.project, before: options.cursor?.at ?? null, limit: options.limit });
  const now = Date.now();
  const matching = entries.filter((entry) => videoMatches(options.status, entry.video, now));
  const names = await projectNames(db, matching.map((entry) => entry.projectId ?? ''));
  const items: FeedItem[] = matching.map((entry) => ({
    kind: 'video',
    id: entry.video.id,
    userId: entry.userId,
    createdAt: entry.video.createdAt,
    video: entry.video,
    projectId: entry.projectId,
    projectName: entry.projectId ? names.get(entry.projectId) ?? null : null,
  }));
  return { items, more: Boolean(nextBefore) };
}

/**
 * One page of what the team (or one account, or one project) made, images and videos merged
 * newest first: finished ones by default, or those in progress, or those that failed.
 * `before` continues from the last page.
 */
export async function loadFeed(userIds: string[], options: { type: FeedType; status: FeedStatus; project?: string | null; before?: string | null; limit?: number }): Promise<FeedPage> {
  const db = createServiceClient();
  const limit = Math.min(60, options.limit ?? 48);
  const shared = { status: options.status, project: options.project ?? null, cursor: parseCursor(options.before), limit };
  const [images, videos] = await Promise.all([
    options.type === 'video' ? Promise.resolve({ items: [] as FeedItem[], more: false }) : feedImages(db, userIds, shared),
    options.type === 'image' ? Promise.resolve({ items: [] as FeedItem[], more: false }) : feedVideos(db, userIds, shared),
  ]);
  const merged = [...images.items, ...videos.items].sort(compareFeed);
  const page = merged.slice(0, limit);
  const more = merged.length > limit || images.more || videos.more;
  return { items: page, nextBefore: more && page.length ? cursorOf(page.at(-1)!) : null };
}

/** A Playground prompt's title: its first line when that is short ("Offer / Promotion"), else its first words. */
function promptTitle(prompt: string | undefined): string | null {
  const text = (prompt ?? '').trim();
  if (!text) return null;
  const [first, ...rest] = text.split('\n');
  if (rest.some((line) => line.trim()) && first.trim().length <= 60) return first.trim();
  const flat = text.replace(/\s+/g, ' ');
  return flat.length > 48 ? `${flat.slice(0, 47).trimEnd()}…` : flat;
}

const RUN_ITEM_COLUMNS = 'id, user_id, project_id, run_id, kind, status, image_url, preview_url, aspect_ratio, width, height, prompt_index, error, created_at, started_at, finished_at';

const time = (value: unknown) => (typeof value === 'string' ? Date.parse(value) : NaN);

/** One Live card: a run's progress, what it is making now and its newest finished images. */
function liveRunOf(run: Row, rows: Row[], now: number): LiveRun | null {
  const project = (run.playground_projects && typeof run.playground_projects === 'object' ? run.playground_projects : null) as Row | null;
  const prompts = Array.isArray(run.prompts) ? (run.prompts as unknown[]).filter((p): p is string => typeof p === 'string') : [];
  const counts = { done: 0, making: 0, waiting: 0, failed: 0 };
  let last = time(run.created_at);
  let first = Infinity;
  for (const row of rows) {
    if (row.status === 'done') counts.done += 1;
    else if (row.status === 'generating') counts.making += 1;
    else if (row.status === 'queued') counts.waiting += 1;
    else counts.failed += 1;
    const started = time(row.started_at);
    const finished = time(row.finished_at);
    if (Number.isFinite(started)) {
      last = Math.max(last, started);
      first = Math.min(first, started);
    }
    if (Number.isFinite(finished)) last = Math.max(last, finished);
  }
  if (counts.making + counts.waiting === 0 || !Number.isFinite(last) || now - last > RUN_PAUSED_MS) return null;
  const paused = now - last > RUN_ACTIVE_MS;

  // The joined shape feedImageOf reads, for the run's finished images.
  const joined = { playground_runs: { prompts, model: run.model, image_size: run.image_size }, playground_projects: project };
  const finishedAt = (row: Row) => time(row.finished_at) || time(row.created_at);
  const latest = rows
    .filter((row) => row.status === 'done' && (row.preview_url || row.image_url))
    .sort((a, b) => finishedAt(b) - finishedAt(a))
    .slice(0, LATEST_PER_RUN)
    .map((row) => feedImageOf({ ...row, ...joined }));
  const makingTitles = [...new Set(rows
    .filter((row) => row.status === 'generating')
    .sort((a, b) => time(a.started_at) - time(b.started_at))
    .map((row) => promptTitle(prompts[Number(row.prompt_index)] ?? prompts[0]))
    .filter((title): title is string => Boolean(title)))].slice(0, 3);
  const waitingNote = paused ? (rows.find((row) => row.status === 'queued' && typeof row.error === 'string' && row.error)?.error as string | undefined) ?? null : null;
  const ratios = Array.isArray(run.aspect_ratios) ? (run.aspect_ratios as unknown[]).filter((r): r is string => typeof r === 'string') : [];

  return {
    kind: 'run',
    id: String(run.id),
    userId: String(run.user_id),
    createdAt: String(run.created_at),
    projectId: (run.project_id as string | null) ?? null,
    projectName: (project?.name as string | null) ?? null,
    model: modelName(run.model),
    size: (run.image_size as string | null) ?? null,
    aspectRatio: ratios[0] ?? null,
    total: rows.length,
    ...counts,
    startedAt: Number.isFinite(first) ? new Date(first).toISOString() : null,
    lastActivityAt: new Date(last).toISOString(),
    paused,
    waitingNote,
    makingTitles,
    latest,
  };
}

/** Playground runs with images still to make (generating, or paused for up to 30 minutes). */
async function loadLiveRuns(db: Db, userIds: string[], now: number): Promise<LiveRun[]> {
  const pending = await db.from('playground_items').select('run_id').in('user_id', userIds).in('status', ['generating', 'queued'])
    .not('run_id', 'is', null).gte('created_at', new Date(now - RUN_LOOKBACK_MS).toISOString())
    .order('created_at', { ascending: false }).limit(1000);
  if (pending.error) console.error('Dashboard: live runs failed:', pending.error);
  const runIds = [...new Set(((pending.data ?? []) as Row[]).map((row) => String(row.run_id)))].slice(0, LIVE_RUNS);
  if (!runIds.length) return [];
  // A run holds 200 images at most, so each run is read whole on its own.
  const [runs, ...itemsByRun] = await Promise.all([
    db.from('playground_runs').select('id, user_id, project_id, prompts, model, image_size, aspect_ratios, created_at, playground_projects(name)').in('id', runIds),
    ...runIds.map((runId) => db.from('playground_items').select(RUN_ITEM_COLUMNS).eq('run_id', runId).limit(500)),
  ]);
  if (runs.error) console.error('Dashboard: live runs failed:', runs.error);
  const rowsOf = new Map(runIds.map((runId, index) => [runId, (itemsByRun[index].data ?? []) as unknown as Row[]]));
  return ((runs.data ?? []) as unknown as Row[])
    .map((run) => liveRunOf(run, rowsOf.get(String(run.id)) ?? [], now))
    .filter((run): run is LiveRun => run !== null);
}

/** Generating work first (newest first), then paused runs. */
function compareLive(a: LiveJob, b: LiveJob): number {
  const pausedA = a.kind === 'run' && a.paused ? 1 : 0;
  const pausedB = b.kind === 'run' && b.paused ? 1 : 0;
  return pausedA - pausedB || Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

/**
 * What is generating right now: Playground runs with images still to make (one entry each,
 * with its progress), video takes rendering (started in the last 2 hours) and video plans
 * waiting for approval (last day).
 */
export async function loadLive(userIds: string[]): Promise<LiveSnapshot> {
  const db = createServiceClient();
  const now = Date.now();
  const [runs, videos] = await Promise.all([loadLiveRuns(db, userIds, now), loadVideosOf(db, userIds, { limit: 40 })]);
  const live = videos.entries.filter(({ video }) => isLiveVideo(video, now));
  const names = await projectNames(db, live.map((entry) => entry.projectId ?? ''));
  const videoJobs: LiveJob[] = live.map((entry) => ({
    kind: 'video',
    id: entry.video.id,
    userId: entry.userId,
    createdAt: entry.video.createdAt,
    video: entry.video,
    projectId: entry.projectId,
    projectName: entry.projectId ? names.get(entry.projectId) ?? null : null,
  }));
  return { jobs: [...runs, ...videoJobs].sort(compareLive), checkedAt: new Date(now).toISOString() };
}

/* --------------------------------------------------------------- the overview */

// Days are counted in India time, where the team works.
const INDIA_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayOf = (time: string | number) => INDIA_DAY.format(new Date(time));

/** Images and new videos made per day (India time) over the last 14 days, today last. */
function activityFrom(entries: UsageEntry[]): ActivityDay[] {
  const now = Date.now();
  const days: ActivityDay[] = Array.from({ length: 14 }, (_, index) => ({ date: dayOf(now - (13 - index) * DAY), images: 0, videos: 0 }));
  const byDate = new Map(days.map((day) => [day.date, day]));
  for (const entry of entries) {
    const day = byDate.get(entry.day);
    if (!day) continue;
    day.images += entry.images;
    day.videos += entry.videos;
  }
  return days;
}

const PROJECT_COLUMNS = 'id, name, kind, cover_url, user_id, updated_at';

function projectOf(row: Row): DashboardProject {
  return {
    id: String(row.id),
    name: String(row.name ?? 'Untitled project'),
    kind: row.kind === 'video' ? 'video' : 'image',
    coverUrl: (row.cover_url as string | null) ?? null,
    userId: String(row.user_id),
    updatedAt: String(row.updated_at),
  };
}

/** The newest team projects, and each member's latest one (what they are working on). */
async function loadProjects(db: Db, userIds: string[]): Promise<{ recent: DashboardProject[]; latest: Map<string, DashboardProject> }> {
  if (!userIds.length) return { recent: [], latest: new Map() };
  const { data } = await db.from('playground_projects').select(PROJECT_COLUMNS).in('user_id', userIds).order('updated_at', { ascending: false }).limit(60);
  const rows = ((data ?? []) as Row[]).map(projectOf);
  const latest = new Map<string, DashboardProject>();
  for (const project of rows) if (!latest.has(project.userId)) latest.set(project.userId, project);
  // Someone whose projects are all older than those 60: ask for theirs.
  await Promise.all(userIds.filter((id) => !latest.has(id)).map(async (id) => {
    const { data: own } = await db.from('playground_projects').select(PROJECT_COLUMNS).eq('user_id', id).order('updated_at', { ascending: false }).limit(1);
    const row = ((own ?? []) as Row[])[0];
    if (row) latest.set(id, projectOf(row));
  }));
  return { recent: rows.slice(0, 5), latest };
}

/**
 * How generations ended over the last 30 days: finished is what the usage log says was made
 * (images and new videos, as every card counts them); failed and cancelled are the Playground
 * images and the videos that ended so.
 */
async function loadOutcomes(db: Db, userIds: string[], entries: UsageEntry[]): Promise<DashboardOutcomes> {
  if (!userIds.length) return { finished: 0, failed: 0, cancelled: 0 };
  const sinceIso = new Date(Date.now() - 30 * DAY).toISOString();
  const items = (status: string) => db.from('playground_items').select('id', { count: 'exact', head: true }).in('user_id', userIds).eq('status', status).gte('created_at', sinceIso);
  const [failed, cancelled, videos] = await Promise.all([
    items('failed'),
    items('cancelled'),
    db.from('usage_logs').select('refunded:metadata->refunded, cancelled:metadata->cancelled').in('user_id', userIds)
      .eq('feature', 'video_generation').in('metadata->>mode', VIDEO_MODES).gte('created_at', sinceIso).limit(5000),
  ]);
  // Finished = what the usage log says was made, in the same 30 India days as the other cards.
  const month = lastIndiaDays(30);
  const recent = entries.filter((entry) => month.has(entry.day));
  const outcome = {
    finished: recent.reduce((total, entry) => total + entry.images + entry.videos, 0),
    failed: failed.count ?? 0,
    cancelled: cancelled.count ?? 0,
  };
  for (const row of (videos.data ?? []) as Row[]) {
    if (row.cancelled === true) outcome.cancelled += 1;
    else if (row.refunded === true) outcome.failed += 1;
  }
  return outcome;
}

/* ------------------------------------------------------------- usage and cost */

/** Rupees per US dollar for the cost estimates; USD_TO_INR changes it. */
const INR_PER_USD = Number(process.env.USD_TO_INR) > 0 ? Number(process.env.USD_TO_INR) : 99;
/** The owner's own accounts: what they make counts in every total, but no row shows them. */
const OWNER_ACCOUNT_EMAILS = [DASHBOARD_OWNER_EMAIL, 'bananabondismyth@gmail.com'];
const USAGE_COLUMNS = 'id, user_id, provider, model, feature, image_count, video_seconds, estimated_cost_usd, credit_cost, created_at, mode:metadata->>mode, refunded:metadata->>refunded, newVideo:metadata->>newVideo, projectId:metadata->>projectId, itemId:metadata->>itemId, label:metadata->>label';
const RANGES: UsageRange[] = ['today', 'yesterday', '7d', '30d', 'all'];

/** The last `count` India days, today included. */
const lastIndiaDays = (count: number, now = Date.now()) => new Set(Array.from({ length: count }, (_, index) => dayOf(now - index * DAY)));

/** The ids of the owner's own (confirmed) accounts. */
async function ownerAccountIds(): Promise<string[]> {
  const admin = createServiceClient();
  const ids: string[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    for (const user of data.users) {
      if (user.email_confirmed_at && OWNER_ACCOUNT_EMAILS.includes((user.email ?? '').toLowerCase())) ids.push(user.id);
    }
    if (data.users.length < 1000) break;
  }
  return ids;
}

/** These accounts' usage rows, oldest first, a thousand at a time. */
async function usageRows(db: Db, userIds: string[]): Promise<Row[]> {
  const rows: Row[] = [];
  if (!userIds.length) return rows;
  for (let from = 0; from < 500_000; from += 1000) {
    const { data, error } = await db.from('usage_logs').select(USAGE_COLUMNS).in('user_id', userIds)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, from + 999);
    if (error) {
      console.error('Dashboard: usage failed:', error);
      break;
    }
    rows.push(...((data ?? []) as Row[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return rows;
}

type SpendModel = Pick<ModelSpend, 'key' | 'name' | 'maker' | 'group'> & { kind: 'image' | 'video' | 'assist' };

/** A usage row's model as the owner reads it: images, videos, or the help around them (prompt writing, checks). */
function spendModel(row: Row): SpendModel {
  const model = typeof row.model === 'string' ? row.model : '';
  const provider = typeof row.provider === 'string' ? row.provider : '';
  if (provider === 'anthropic') return { key: 'claude', name: 'Claude · prompt writing', maker: 'Anthropic', group: 'other', kind: 'assist' };
  if (/veo/i.test(model)) return { key: /fast/i.test(model) ? 'veo-fast' : 'veo', name: /fast/i.test(model) ? 'Veo 3.1 Fast' : 'Veo 3.1', maker: 'Google', group: 'video', kind: 'video' };
  if (/seedance/i.test(model)) return { key: seedanceSpec(model).id, name: seedanceSpec(model).name, maker: 'BytePlus', group: 'video', kind: 'video' };
  if (provider === 'openai') return { key: model, name: modelName(model) ?? model, maker: 'OpenAI', group: 'gpt', kind: 'image' };
  if ((Number(row.image_count) || 0) > 0) {
    // The old Generate page logged Nano Banana Pro by its nickname.
    const id = model === 'nano-banana-pro' ? 'gemini-3-pro-image' : model;
    return { key: id, name: modelName(id) ?? id, maker: 'Gemini', group: 'gemini', kind: 'image' };
  }
  return { key: 'gemini-assist', name: 'Gemini · checks and analysis', maker: 'Gemini', group: 'other', kind: 'assist' };
}

/**
 * One usage row as the dashboard counts it. Every number on the dashboard that says what was
 * made or spent comes from these, so the cards agree (deleted images still count: they were made).
 */
interface UsageEntry {
  userId: string;
  at: number;
  /** Its India day (YYYY-MM-DD). */
  day: string;
  model: Omit<SpendModel, 'kind'>;
  images: number;
  gemini: number;
  gpt: number;
  /** 1 for a new video's first render (not a redraft or an upgrade). */
  videos: number;
  /** 1 for any charged video render. */
  renders: number;
  credits: number;
  usd: number;
  mode: string;
  projectId: string | null;
  /** The Playground image it made (for an edit: the image it edited). */
  itemId: string | null;
  /** What a render made outside the app was ("Colorland Treetop ad v1 · 30 s draft"). */
  label: string | null;
}

/** A usage row as counted; refunded work counts nowhere. */
function usageEntry(row: Row): UsageEntry | null {
  if (row.refunded === 'true') return null;
  const at = Date.parse(String(row.created_at));
  const { kind, ...model } = spendModel(row);
  const images = kind === 'image' ? Number(row.image_count) || 0 : 0;
  // Every charged render counts (the oldest Veo ones predate kept files). Only a first render is
  // a new video; renders made outside the app (mode "outside_app") say whether they are one.
  const renders = kind === 'video' && (Number(row.video_seconds) || 0) > 0 ? 1 : 0;
  const mode = String(row.mode ?? '');
  const first = VIDEO_MODES.includes(mode) || (mode === 'outside_app' && row.newVideo === 'true');
  return {
    userId: String(row.user_id),
    at,
    day: dayOf(at),
    model,
    images,
    gemini: model.group === 'gemini' ? images : 0,
    gpt: model.group === 'gpt' ? images : 0,
    videos: renders && first ? 1 : 0,
    renders,
    credits: Number(row.credit_cost) || 0,
    usd: Number(row.estimated_cost_usd) || 0,
    mode,
    projectId: typeof row.projectId === 'string' && row.projectId ? row.projectId : null,
    itemId: typeof row.itemId === 'string' && row.itemId ? row.itemId : null,
    label: typeof row.label === 'string' && row.label ? row.label : null,
  };
}

/** What these accounts made and spent, as counted, oldest first. */
async function usageEntries(db: Db, userIds: string[]): Promise<UsageEntry[]> {
  return (await usageRows(db, userIds)).map(usageEntry).filter((entry): entry is UsageEntry => entry !== null);
}

const emptyCounts = (): UsageCounts & { usd: number } => ({ images: 0, gemini: 0, gpt: 0, videos: 0, credits: 0, costInr: 0, usd: 0 });

/**
 * What was made and spent for each period (India days): images split by Gemini and GPT
 * Image, new videos, credits and provider cost, per team account and per model. Entries of
 * the owner's own accounts count in the totals and per model but get no row. Costs come from
 * the providers' prices, so they are estimates, in rupees at INR_PER_USD.
 */
function summarizeUsage(entries: UsageEntry[], teamIds: string[]): DashboardUsage {
  const now = Date.now();
  const team = new Set(teamIds);
  const days: Record<Exclude<UsageRange, 'all'>, Set<string>> = {
    today: lastIndiaDays(1, now),
    yesterday: new Set([dayOf(now - DAY)]),
    '7d': lastIndiaDays(7, now),
    '30d': lastIndiaDays(30, now),
  };
  type Bucket = ModelSpend & { usd: number };
  const models = new Map(RANGES.map((range) => [range, new Map<string, Bucket>()]));
  const totals = new Map(RANGES.map((range) => [range, emptyCounts()]));
  const members = new Map(RANGES.map((range) => [range, new Map<string, UsageCounts & { usd: number }>()]));

  for (const entry of entries) {
    const add = (counts: UsageCounts & { usd: number }) => {
      counts.images += entry.images;
      counts.gemini += entry.gemini;
      counts.gpt += entry.gpt;
      counts.videos += entry.videos;
      counts.credits += entry.credits;
      counts.usd += entry.usd;
    };
    for (const range of RANGES) {
      if (range !== 'all' && !days[range].has(entry.day)) continue;
      const byKey = models.get(range)!;
      const bucket = byKey.get(entry.model.key) ?? { ...entry.model, images: 0, videos: 0, renders: 0, credits: 0, costInr: 0, usd: 0 };
      bucket.images += entry.images;
      bucket.videos += entry.videos;
      bucket.renders += entry.renders;
      bucket.credits += entry.credits;
      bucket.usd += entry.usd;
      byKey.set(entry.model.key, bucket);
      add(totals.get(range)!);
      if (team.has(entry.userId)) {
        const byUser = members.get(range)!;
        const counts = byUser.get(entry.userId) ?? emptyCounts();
        add(counts);
        byUser.set(entry.userId, counts);
      }
    }
  }

  const inr = (usd: number) => Math.round(usd * INR_PER_USD);
  const finish = <T extends { usd: number; costInr: number }>({ usd, ...rest }: T) => ({ ...rest, costInr: inr(usd) });
  const period = (range: UsageRange): UsagePeriod => ({
    ...finish(totals.get(range)!),
    members: [...members.get(range)!.entries()]
      .map(([userId, counts]) => ({ userId, ...finish(counts) }))
      .sort((a, b) => b.images - a.images || b.credits - a.credits),
  });
  return {
    inrPerUsd: INR_PER_USD,
    periods: Object.fromEntries(RANGES.map((range) => [range, period(range)])) as Record<UsageRange, UsagePeriod>,
    byModel: Object.fromEntries(RANGES.map((range) => [range, [...models.get(range)!.values()]
      .map((bucket) => finish(bucket))
      .filter((spend) => spend.credits > 0 || spend.costInr > 0)
      // Most spent first: what each model cost, then its credits.
      .sort((a, b) => b.costInr - a.costInr || b.credits - a.credits)])) as Record<UsageRange, ModelSpend[]>,
  };
}

/* --------------------------------------------------------------- insights */

/** Is this India day inside the period? */
function rangeDays(now: number): (range: UsageRange, day: string) => boolean {
  const days: Record<Exclude<UsageRange, 'all'>, Set<string>> = {
    today: lastIndiaDays(1, now),
    yesterday: new Set([dayOf(now - DAY)]),
    '7d': lastIndiaDays(7, now),
    '30d': lastIndiaDays(30, now),
  };
  return (range, day) => range === 'all' || days[range].has(day);
}

/** Every row of a table for these accounts, a thousand at a time. */
async function rowsOf(db: Db, table: string, columns: string, userIds: string[]): Promise<Row[]> {
  const rows: Row[] = [];
  if (!userIds.length) return rows;
  for (let from = 0; from < 500_000; from += 1000) {
    const { data, error } = await db.from(table).select(columns).in('user_id', userIds).order('id', { ascending: true }).range(from, from + 999);
    if (error) {
      console.error(`Dashboard: ${table} failed:`, error);
      break;
    }
    rows.push(...((data ?? []) as unknown as Row[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return rows;
}

/**
 * Projects grouped into clients: a project whose name starts with another project's whole name
 * at a word break joins it ("Thriller 40 Prompts" and "Thriller Grip me" join "Thriller").
 */
function clientNames(names: string[]): Map<string, string> {
  const byLower = new Map<string, string>();
  for (const name of [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) => a.length - b.length)) {
    const lower = name.toLowerCase();
    const base = [...byLower.keys()].find((known) => lower === known || lower.startsWith(`${known} `));
    byLower.set(lower, base ? byLower.get(base)! : name);
  }
  return byLower;
}

/**
 * Spend per client, wasted spend and a scorecard per image model, for each period, from the
 * usage entries (as every other card counts) and the Playground images that still exist: a
 * Playground image whose row is gone was deleted after it was made (and paid for).
 */
async function loadInsights(db: Db, entries: UsageEntry[], counted: string[], teamIds: string[]): Promise<DashboardInsights> {
  const now = Date.now();
  const inRange = rangeDays(now);
  const team = new Set(teamIds);
  const [items, runs, names] = await Promise.all([
    rowsOf(db, 'playground_items', 'id, run_id, status, favorite, started_at, finished_at, created_at', counted),
    rowsOf(db, 'playground_runs', 'id, model', counted),
    projectNames(db, entries.map((entry) => entry.projectId ?? '')),
  ]);
  const itemById = new Map(items.map((item) => [String(item.id), item]));
  const modelOfRun = new Map(runs.map((run) => [String(run.id), String(run.model)]));
  const inr = (usd: number) => Math.round(usd * INR_PER_USD);

  // Clients: the project's name, a render made outside the app by its label's first word.
  const projectName = (entry: UsageEntry) => entry.projectId
    ? names.get(entry.projectId) ?? 'Deleted project'
    : entry.mode === 'outside_app' && entry.label ? entry.label.split(' ')[0] : 'No project';
  const clientOf = clientNames(entries.map(projectName));

  const failedItems = items.filter((item) => item.status === 'failed');
  const failedDay = (item: Row) => dayOf(String(item.finished_at ?? item.created_at));

  const clients = {} as Record<UsageRange, ClientSpend[]>;
  const waste = {} as Record<UsageRange, WasteSummary>;
  const scorecard = {} as Record<UsageRange, ModelScore[]>;

  for (const range of RANGES) {
    const inPeriod = entries.filter((entry) => inRange(range, entry.day));

    type ClientBucket = Omit<ClientSpend, 'projects' | 'userIds' | 'costInr'> & { projects: Set<string>; users: Set<string>; usd: number };
    const byClient = new Map<string, ClientBucket>();
    for (const entry of inPeriod) {
      const project = projectName(entry);
      const name = clientOf.get(project.toLowerCase()) ?? project;
      const bucket = byClient.get(name.toLowerCase()) ?? { key: name.toLowerCase(), name, projects: new Set<string>(), users: new Set<string>(), images: 0, videos: 0, credits: 0, usd: 0 };
      bucket.projects.add(project);
      if (team.has(entry.userId)) bucket.users.add(entry.userId);
      bucket.images += entry.images;
      bucket.videos += entry.videos;
      bucket.credits += entry.credits;
      bucket.usd += entry.usd;
      byClient.set(bucket.key, bucket);
    }
    clients[range] = [...byClient.values()]
      .map(({ projects, users, usd, ...client }) => ({ ...client, projects: [...projects], userIds: [...users], costInr: inr(usd) }))
      .filter((client) => client.credits > 0 || client.costInr > 0)
      .sort((a, b) => b.costInr - a.costInr || b.credits - a.credits);

    // Waste: Playground images (followed by their row) that are gone now.
    const wasteMembers = new Map<string, { userId: string; made: number; deleted: number; deletedUsd: number }>();
    const summary = { made: 0, deleted: 0, deletedUsd: 0, imageUsd: 0 };
    type ScoreBucket = Omit<ModelScore, 'costInr' | 'costPerImageInr' | 'avgSeconds'> & { usd: number; seconds: number; timed: number };
    const byModel = new Map<string, ScoreBucket>();
    for (const entry of inPeriod) {
      if (!entry.images) continue;
      summary.imageUsd += entry.usd;
      const score = byModel.get(entry.model.key) ?? { ...entry.model, images: 0, tracked: 0, deleted: 0, favorites: 0, failed: 0, usd: 0, seconds: 0, timed: 0 };
      score.images += entry.images;
      score.usd += entry.usd;
      if (entry.mode === 'playground' && entry.itemId) {
        const item = itemById.get(entry.itemId);
        score.tracked += entry.images;
        summary.made += entry.images;
        if (!item) {
          score.deleted += entry.images;
          summary.deleted += entry.images;
          summary.deletedUsd += entry.usd;
        } else {
          if (item.favorite === true) score.favorites += 1;
          const seconds = (Date.parse(String(item.finished_at)) - Date.parse(String(item.started_at))) / 1000;
          if (item.status === 'done' && Number.isFinite(seconds) && seconds > 0 && seconds < 3600) {
            score.seconds += seconds;
            score.timed += 1;
          }
        }
        if (team.has(entry.userId)) {
          const member = wasteMembers.get(entry.userId) ?? { userId: entry.userId, made: 0, deleted: 0, deletedUsd: 0 };
          member.made += entry.images;
          if (!item) {
            member.deleted += entry.images;
            member.deletedUsd += entry.usd;
          }
          wasteMembers.set(entry.userId, member);
        }
      }
      byModel.set(entry.model.key, score);
    }
    const failed = failedItems.filter((item) => inRange(range, failedDay(item)));
    for (const item of failed) {
      const key = modelOfRun.get(String(item.run_id));
      const score = key ? byModel.get(key) : undefined;
      if (score) score.failed += 1;
    }
    waste[range] = {
      made: summary.made,
      deleted: summary.deleted,
      deletedCostInr: inr(summary.deletedUsd),
      imageCostInr: inr(summary.imageUsd),
      failed: failed.length,
      members: [...wasteMembers.values()]
        .filter((member) => member.deleted > 0)
        .map(({ deletedUsd, ...member }) => ({ ...member, deletedCostInr: inr(deletedUsd) }))
        .sort((a, b) => b.deletedCostInr - a.deletedCostInr || b.deleted - a.deleted),
    };
    scorecard[range] = [...byModel.values()]
      .map(({ usd, seconds, timed, ...score }) => ({
        ...score,
        costInr: inr(usd),
        costPerImageInr: score.images ? Math.round((usd * INR_PER_USD * 100) / score.images) / 100 : 0,
        avgSeconds: timed ? Math.round(seconds / timed) : null,
      }))
      .sort((a, b) => b.images - a.images);
  }
  return { clients, waste, scorecard };
}

/**
 * The accounts with what each made, the headline numbers, the last 14 days, projects, results,
 * usage and cost, and how much is generating now. Everything that counts what was made or
 * spent comes from the usage log, so the cards agree; the owner's own accounts count in the
 * totals but get no row (and their work is not listed as live).
 */
export async function loadOverview(): Promise<DashboardOverview> {
  const db = createServiceClient();
  const [members, ownerIds] = await Promise.all([listTeamMembers(), ownerAccountIds()]);
  const ids = members.map((member) => member.id);
  const counted = [...ids, ...ownerIds];
  const [entries, live, projects] = await Promise.all([
    usageEntries(db, counted),
    ids.length ? loadLive(ids) : Promise.resolve({ jobs: [], checkedAt: '' } as LiveSnapshot),
    loadProjects(db, ids),
  ]);
  const [summaries, outcomes30d, insights] = await Promise.all([
    Promise.all(members.map((member) => memberSummary(member.id, entries))),
    loadOutcomes(db, counted, entries),
    loadInsights(db, entries, counted, ids),
  ]);
  const activity = activityFrom(entries);
  const usage = summarizeUsage(entries, ids);
  const sum = (days: ActivityDay[], key: 'images' | 'videos') => days.reduce((total, day) => total + day[key], 0);
  return {
    domain: TEAM_DOMAIN,
    members: members.map((member, index) => ({
      ...member,
      summary: summaries[index],
      liveCount: live.jobs.filter((job) => job.userId === member.id).length,
      latestProject: projects.latest.get(member.id) ?? null,
    })),
    recentProjects: projects.recent,
    outcomes30d,
    usage,
    insights,
    kpis: {
      images7d: sum(activity.slice(7), 'images'),
      imagesPrev7d: sum(activity.slice(0, 7), 'images'),
      videos7d: sum(activity.slice(7), 'videos'),
      videosPrev7d: sum(activity.slice(0, 7), 'videos'),
      // The same 30 India days as the Credits & cost card.
      credits30d: usage.periods['30d'].credits,
      liveCount: live.jobs.length,
    },
    activity,
  };
}
