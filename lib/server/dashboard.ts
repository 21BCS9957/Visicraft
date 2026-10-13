import 'server-only';

import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { ApiError, withUser } from '@/lib/server/playground/http';
import { loadVideosOf } from '@/lib/server/videoHistory';
import { isPlaygroundModel, playgroundModel } from '@/lib/playground/models';
import { studioVideoStatus, type StudioVideo } from '@/lib/video/shared';
import type {
  ActivityDay,
  DashboardOutcomes,
  DashboardOverview,
  DashboardProject,
  FeedImage,
  FeedItem,
  FeedPage,
  FeedStatus,
  FeedType,
  LiveJob,
  LiveRun,
  LiveSnapshot,
  TeamMember,
  TeamMemberSummary,
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

/** A video row rendered a file (its `videoUrls` holds one): a made video, not a plan or a failure. */
function renderedVideo(row: Row): boolean {
  const urls = row.videoUrls;
  return Boolean(urls && typeof urls === 'object' && Object.values(urls as Row).some((url) => typeof url === 'string' && url));
}

/** What an account has made: projects, finished images, rendered videos, credits spent in 30 days, balance, last activity. */
export async function memberSummary(userId: string): Promise<TeamMemberSummary> {
  const db = createServiceClient();
  const count = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await query;
    return error ? 0 : n ?? 0;
  };
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const [imageProjects, videoProjects, imagesMade, videos, spent, latest, credits] = await Promise.all([
    count(db.from('playground_projects').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'image')),
    count(db.from('playground_projects').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'video')),
    count(db.from('playground_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'done')),
    db.from('usage_logs').select('videoUrls:metadata->videoUrls').eq('user_id', userId).eq('feature', 'video_generation').in('metadata->>mode', VIDEO_MODES).limit(5000),
    db.from('usage_logs').select('credit_cost').eq('user_id', userId).gte('created_at', since).limit(5000),
    db.from('usage_logs').select('created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
    db.from('user_credits').select('credits').eq('user_id', userId).maybeSingle(),
  ]);
  const videosMade = ((videos.data ?? []) as Row[]).filter(renderedVideo).length;
  const creditsUsed30d = ((spent.data ?? []) as Array<{ credit_cost: number | null }>).reduce((sum, row) => sum + (Number(row.credit_cost) || 0), 0);
  const lastActiveAt = ((latest.data ?? []) as Array<{ created_at: string }>)[0]?.created_at ?? null;
  const balance = typeof credits.data?.credits === 'number' ? credits.data.credits : null;
  return { imageProjects, videoProjects, imagesMade, videosMade, creditsUsed30d, balance, lastActiveAt };
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

/** Finished images and rendered videos per day over the last 14 days (today last). */
async function loadActivity(db: Db, userIds: string[]): Promise<ActivityDay[]> {
  const now = Date.now();
  const days: ActivityDay[] = Array.from({ length: 14 }, (_, index) => ({ date: dayOf(now - (13 - index) * DAY), images: 0, videos: 0 }));
  if (!userIds.length) return days;
  const byDate = new Map(days.map((day) => [day.date, day]));
  const since = new Date(now - 15 * DAY).toISOString();
  const [items, quick, videos] = await Promise.all([
    db.from('playground_items').select('created_at').in('user_id', userIds).eq('status', 'done').gte('created_at', since).limit(20000),
    db.from('generations').select('created_at, generated_thumbnails').in('user_id', userIds).gte('created_at', since).limit(5000),
    db.from('usage_logs').select('created_at, videoUrls:metadata->videoUrls').in('user_id', userIds).eq('feature', 'video_generation')
      .in('metadata->>mode', VIDEO_MODES).gte('created_at', since).limit(5000),
  ]);
  for (const row of (items.data ?? []) as Row[]) {
    const day = byDate.get(dayOf(String(row.created_at)));
    if (day) day.images += 1;
  }
  for (const row of (quick.data ?? []) as Row[]) {
    const day = byDate.get(dayOf(String(row.created_at)));
    const count = Array.isArray(row.generated_thumbnails) ? row.generated_thumbnails.length : 0;
    if (day) day.images += count;
  }
  for (const row of (videos.data ?? []) as Row[]) {
    const day = byDate.get(dayOf(String(row.created_at)));
    if (day && renderedVideo(row)) day.videos += 1;
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
 * How generations ended over the last 30 days: Playground images by status, quick
 * generations (always finished), and videos (rendered, refunded = failed, or cancelled).
 */
async function loadOutcomes(db: Db, userIds: string[]): Promise<DashboardOutcomes> {
  if (!userIds.length) return { finished: 0, failed: 0, cancelled: 0 };
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const items = (status: string) => db.from('playground_items').select('id', { count: 'exact', head: true }).in('user_id', userIds).eq('status', status).gte('created_at', since);
  const [done, failed, cancelled, quick, videos] = await Promise.all([
    items('done'),
    items('failed'),
    items('cancelled'),
    db.from('generations').select('generated_thumbnails').in('user_id', userIds).gte('created_at', since).limit(5000),
    db.from('usage_logs').select('videoUrls:metadata->videoUrls, refunded:metadata->refunded, cancelled:metadata->cancelled').in('user_id', userIds)
      .eq('feature', 'video_generation').in('metadata->>mode', VIDEO_MODES).gte('created_at', since).limit(5000),
  ]);
  const outcome = { finished: done.count ?? 0, failed: failed.count ?? 0, cancelled: cancelled.count ?? 0 };
  for (const row of (quick.data ?? []) as Row[]) outcome.finished += Array.isArray(row.generated_thumbnails) ? row.generated_thumbnails.length : 0;
  for (const row of (videos.data ?? []) as Row[]) {
    if (renderedVideo(row)) outcome.finished += 1;
    else if (row.cancelled === true) outcome.cancelled += 1;
    else if (row.refunded === true) outcome.failed += 1;
  }
  return outcome;
}

/** The accounts with what each made, the headline numbers, the last 14 days, projects, results and how much is generating now. */
export async function loadOverview(): Promise<DashboardOverview> {
  const db = createServiceClient();
  const members = await listTeamMembers();
  const ids = members.map((member) => member.id);
  const [summaries, live, activity, projects, outcomes30d] = await Promise.all([
    Promise.all(members.map((member) => memberSummary(member.id))),
    ids.length ? loadLive(ids) : Promise.resolve({ jobs: [], checkedAt: '' } as LiveSnapshot),
    loadActivity(db, ids),
    loadProjects(db, ids),
    loadOutcomes(db, ids),
  ]);
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
    kpis: {
      images7d: sum(activity.slice(7), 'images'),
      imagesPrev7d: sum(activity.slice(0, 7), 'images'),
      videos7d: sum(activity.slice(7), 'videos'),
      videosPrev7d: sum(activity.slice(0, 7), 'videos'),
      credits30d: summaries.reduce((total, summary) => total + summary.creditsUsed30d, 0),
      liveCount: live.jobs.length,
    },
    activity,
  };
}
