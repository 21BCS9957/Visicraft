import 'server-only';

import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { ApiError, withUser } from '@/lib/server/playground/http';
import { loadVideosOf } from '@/lib/server/videoHistory';
import { isPlaygroundModel, playgroundModel } from '@/lib/playground/models';
import { studioVideoStatus } from '@/lib/video/shared';
import type {
  DashboardOverview,
  FeedImage,
  FeedItem,
  FeedPage,
  FeedStatus,
  FeedType,
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

/** What an account has made: projects, finished images, videos, credits spent in 30 days, balance, last activity. */
export async function memberSummary(userId: string): Promise<TeamMemberSummary> {
  const db = createServiceClient();
  const count = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await query;
    return error ? 0 : n ?? 0;
  };
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const [imageProjects, videoProjects, imagesMade, videosMade, spent, latest, credits] = await Promise.all([
    count(db.from('playground_projects').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'image')),
    count(db.from('playground_projects').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'video')),
    count(db.from('playground_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'done')),
    count(db.from('usage_logs').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('feature', 'video_generation').in('metadata->>mode', VIDEO_MODES)),
    db.from('usage_logs').select('credit_cost').eq('user_id', userId).gte('created_at', since).limit(5000),
    db.from('usage_logs').select('created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
    db.from('user_credits').select('credits').eq('user_id', userId).maybeSingle(),
  ]);
  const creditsUsed30d = ((spent.data ?? []) as Array<{ credit_cost: number | null }>).reduce((sum, row) => sum + (Number(row.credit_cost) || 0), 0);
  const lastActiveAt = ((latest.data ?? []) as Array<{ created_at: string }>)[0]?.created_at ?? null;
  const balance = typeof credits.data?.credits === 'number' ? credits.data.credits : null;
  return { imageProjects, videoProjects, imagesMade, videosMade, creditsUsed30d, balance, lastActiveAt };
}

/* ------------------------------------------------------------------ the feed */

const ITEM_FEED_COLUMNS = 'id, user_id, project_id, run_id, kind, status, image_url, preview_url, aspect_ratio, prompt_index, error, created_at, started_at, playground_runs(prompts, model, image_size), playground_projects(name)';

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

/** Team images (Playground and quick generations), newest first. */
async function feedImages(db: Db, userIds: string[], options: { status: FeedStatus; before?: string | null; limit: number }) {
  const items = () => {
    let query = db.from('playground_items').select(ITEM_FEED_COLUMNS).in('user_id', userIds).order('created_at', { ascending: false }).limit(options.limit + 1);
    if (options.status === 'done') query = query.eq('status', 'done');
    else if (options.status === 'failed') query = query.eq('status', 'failed');
    else if (options.status === 'live') query = query.in('status', ['generating', 'queued']);
    if (options.before) query = query.lt('created_at', options.before);
    return query;
  };
  const quick = () => {
    let query = db.from('generations').select('id, user_id, generated_thumbnails, prompt, model, aspect_ratio, resolution, created_at').in('user_id', userIds).order('created_at', { ascending: false }).limit(options.limit + 1);
    if (options.before) query = query.lt('created_at', options.before);
    return query;
  };
  const [playground, generations] = await Promise.all([
    items(),
    options.status === 'all' || options.status === 'done' ? quick() : Promise.resolve({ data: [] as Row[], error: null }),
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

function videoMatches(status: FeedStatus, item: FeedItem): boolean {
  if (item.kind !== 'video' || status === 'all') return true;
  const state = studioVideoStatus(item.video);
  if (status === 'done') return state === 'ready';
  if (status === 'failed') return state === 'failed' || state === 'cancelled';
  return state === 'rendering' || state === 'review';
}

/** Team videos, newest first. */
async function feedVideos(db: Db, userIds: string[], options: { status: FeedStatus; before?: string | null; limit: number }) {
  const { entries, nextBefore } = await loadVideosOf(db, userIds, { before: options.before, limit: options.limit });
  const names = await projectNames(db, entries.map((entry) => entry.projectId ?? ''));
  const items: FeedItem[] = entries.map((entry) => ({
    kind: 'video',
    id: entry.video.id,
    userId: entry.userId,
    createdAt: entry.video.createdAt,
    video: entry.video,
    projectId: entry.projectId,
    projectName: entry.projectId ? names.get(entry.projectId) ?? null : null,
  }));
  return { items: items.filter((item) => videoMatches(options.status, item)), more: Boolean(nextBefore) };
}

/**
 * One page of everything the team (or one account) made, images and videos merged newest
 * first. `before` continues from the last page.
 */
export async function loadFeed(userIds: string[], options: { type: FeedType; status: FeedStatus; before?: string | null; limit?: number }): Promise<FeedPage> {
  const db = createServiceClient();
  const limit = Math.min(60, options.limit ?? 36);
  const [images, videos] = await Promise.all([
    options.type === 'video' ? Promise.resolve({ items: [] as FeedItem[], more: false }) : feedImages(db, userIds, { ...options, limit }),
    options.type === 'image' ? Promise.resolve({ items: [] as FeedItem[], more: false }) : feedVideos(db, userIds, { ...options, limit }),
  ]);
  const merged = [...images.items, ...videos.items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const page = merged.slice(0, limit);
  const more = merged.length > limit || images.more || videos.more;
  return { items: page, nextBefore: more && page.length ? page.at(-1)!.createdAt : null };
}

/**
 * What is generating right now: Playground images in progress (last 30 minutes), video takes
 * rendering (started in the last 2 hours) and video plans waiting for approval (last day).
 */
export async function loadLive(userIds: string[]): Promise<LiveSnapshot> {
  const db = createServiceClient();
  const now = Date.now();
  const [images, videos] = await Promise.all([
    db.from('playground_items').select(ITEM_FEED_COLUMNS).in('user_id', userIds).in('status', ['generating', 'queued'])
      .gte('created_at', new Date(now - 30 * MINUTE).toISOString()).order('created_at', { ascending: false }).limit(60),
    loadVideosOf(db, userIds, { limit: 40 }),
  ]);
  const imageItems = ((images.data ?? []) as unknown as Row[]).map(feedImageOf);
  const live = videos.entries.filter(({ video }) => {
    const state = studioVideoStatus(video);
    if (state === 'review') return now - Date.parse(video.createdAt) < DAY;
    if (state !== 'rendering') return false;
    const rendering = video.takes.filter((take) => take.status === 'rendering');
    return rendering.some((take) => now - Date.parse(take.createdAt) < 2 * 60 * MINUTE);
  });
  const names = await projectNames(db, live.map((entry) => entry.projectId ?? ''));
  const videoItems: FeedItem[] = live.map((entry) => ({
    kind: 'video',
    id: entry.video.id,
    userId: entry.userId,
    createdAt: entry.video.createdAt,
    video: entry.video,
    projectId: entry.projectId,
    projectName: entry.projectId ? names.get(entry.projectId) ?? null : null,
  }));
  return {
    items: [...imageItems, ...videoItems].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    checkedAt: new Date(now).toISOString(),
  };
}

/** The accounts, each with what they made and how much is generating now. */
export async function loadOverview(): Promise<DashboardOverview> {
  const members = await listTeamMembers();
  const [summaries, live] = await Promise.all([
    Promise.all(members.map((member) => memberSummary(member.id))),
    members.length ? loadLive(members.map((member) => member.id)) : Promise.resolve({ items: [], checkedAt: '' }),
  ]);
  return {
    domain: TEAM_DOMAIN,
    members: members.map((member, index) => ({
      ...member,
      summary: summaries[index],
      liveCount: live.items.filter((item) => item.userId === member.id).length,
    })),
  };
}
