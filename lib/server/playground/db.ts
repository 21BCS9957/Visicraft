import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import { playgroundModel } from '@/lib/playground/models';
import type {
  PlaygroundBundle,
  PlaygroundItem,
  PlaygroundProject,
  PlaygroundReference,
  PlaygroundRun,
  ReferenceSnapshot,
} from '@/lib/playground/types';
import { ApiError, assertDb, isSetupError, SETUP_MESSAGE } from './http';

export type Db = ReturnType<typeof createServiceClient>;

export function playgroundDb(): Db {
  return createServiceClient();
}

type Row = Record<string, unknown>;

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const strOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown, fallback = 0): number => (typeof value === 'number' ? value : Number(value ?? fallback) || fallback);
const numOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

export const ITEM_COLUMNS =
  'id, run_id, kind, parent_item_id, position, prompt_index, aspect_ratio, variation, status, image_url, preview_url, width, height, error, favorite, attempts, canvas_doc, started_at, finished_at, created_at';

export function toProject(row: Row): PlaygroundProject {
  return {
    id: str(row.id),
    name: str(row.name),
    brief: str(row.brief),
    settings: (row.settings as PlaygroundProject['settings']) ?? {},
    coverUrl: strOrNull(row.cover_url),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function toReference(row: Row): PlaygroundReference {
  return {
    id: str(row.id),
    url: str(row.url),
    role: (['product', 'person', 'style'].includes(str(row.role)) ? row.role : 'product') as PlaygroundReference['role'],
    label: str(row.label),
    enabled: row.enabled !== false,
    width: numOrNull(row.width),
    height: numOrNull(row.height),
    sourceItemId: strOrNull(row.source_item_id),
    createdAt: str(row.created_at),
  };
}

export function toRun(row: Row): PlaygroundRun {
  return {
    id: str(row.id),
    model: playgroundModel(str(row.model)).id,
    size: str(row.image_size) as PlaygroundRun['size'],
    ratios: (row.aspect_ratios as string[]) ?? [],
    variations: num(row.variations, 1),
    thinking: (strOrNull(row.thinking) as PlaygroundRun['thinking']) ?? null,
    brief: str(row.brief),
    references: (row.reference_snapshot as ReferenceSnapshot[]) ?? [],
    prompts: (row.prompts as string[]) ?? [],
    imageCount: num(row.image_count),
    creditsPerImage: num(row.credits_per_image),
    cancelledAt: strOrNull(row.cancelled_at),
    createdAt: str(row.created_at),
  };
}

export function toItem(row: Row): PlaygroundItem {
  return {
    id: str(row.id),
    runId: strOrNull(row.run_id),
    kind: row.kind === 'edit' ? 'edit' : 'generated',
    parentItemId: strOrNull(row.parent_item_id),
    position: num(row.position),
    promptIndex: numOrNull(row.prompt_index),
    aspectRatio: str(row.aspect_ratio),
    variation: num(row.variation, 1),
    status: str(row.status) as PlaygroundItem['status'],
    imageUrl: strOrNull(row.image_url),
    previewUrl: strOrNull(row.preview_url),
    width: numOrNull(row.width),
    height: numOrNull(row.height),
    error: strOrNull(row.error),
    favorite: row.favorite === true,
    attempts: num(row.attempts),
    hasCanvas: row.canvas_doc !== null && row.canvas_doc !== undefined,
    startedAt: strOrNull(row.started_at),
    finishedAt: strOrNull(row.finished_at),
    createdAt: str(row.created_at),
  };
}

export async function getOwnedProject(db: Db, projectId: string, userId: string): Promise<Row> {
  const { data, error } = await db
    .from('playground_projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  assertDb(error, 'load the project');
  if (!data) throw new ApiError(404, 'Project not found.', 'not_found');
  return data as Row;
}

export async function getOwnedItem(db: Db, itemId: string, userId: string, columns = '*'): Promise<Row> {
  const { data, error } = await db
    .from('playground_items')
    .select(columns)
    .eq('id', itemId)
    .eq('user_id', userId)
    .maybeSingle();
  assertDb(error, 'load the image');
  if (!data) throw new ApiError(404, 'Image not found.', 'not_found');
  return data as unknown as Row;
}

const RUNS_PER_PAGE = 10;

/** Fails and refunds images a stopped request left generating, then loads the project. */
export async function loadProjectBundle(db: Db, userId: string, projectId: string, before?: string | null): Promise<PlaygroundBundle> {
  const sweep = await db.rpc('playground_fail_stale_items', { p_user_id: userId, p_older_than_seconds: 600 });
  if (sweep.error && isSetupError(sweep.error)) throw new ApiError(503, SETUP_MESSAGE, 'setup');
  if (sweep.error) console.error('Playground: stale sweep failed:', sweep.error);

  const project = toProject(await getOwnedProject(db, projectId, userId));

  let runsQuery = db
    .from('playground_runs')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(RUNS_PER_PAGE + 1);
  if (before) runsQuery = runsQuery.lt('created_at', before);

  const [referencesResult, runsResult] = await Promise.all([
    before
      ? Promise.resolve({ data: [] as Row[], error: null })
      : db.from('playground_references').select('*').eq('project_id', projectId).eq('user_id', userId)
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    runsQuery,
  ]);
  assertDb(referencesResult.error, 'load the references');
  assertDb(runsResult.error, 'load the runs');

  const runRows = (runsResult.data ?? []) as Row[];
  const pageRuns = runRows.slice(0, RUNS_PER_PAGE).map(toRun);
  const nextBefore = runRows.length > RUNS_PER_PAGE ? pageRuns[pageRuns.length - 1]?.createdAt ?? null : null;

  const items: PlaygroundItem[] = [];
  if (pageRuns.length) {
    const { data, error } = await db
      .from('playground_items')
      .select(ITEM_COLUMNS)
      .in('run_id', pageRuns.map((run) => run.id))
      .order('position', { ascending: true });
    assertDb(error, 'load the images');
    items.push(...((data ?? []) as unknown as Row[]).map(toItem));
  }
  if (!before) {
    const { data, error } = await db
      .from('playground_items')
      .select(ITEM_COLUMNS)
      .eq('project_id', projectId)
      .eq('kind', 'edit')
      .order('created_at', { ascending: false })
      .limit(100);
    assertDb(error, 'load the edited images');
    items.push(...((data ?? []) as unknown as Row[]).map(toItem));
  }

  // A run whose images were all deleted has nothing to show.
  const withItems = new Set(items.map((item) => item.runId));
  return {
    project,
    references: ((referencesResult.data ?? []) as Row[]).map(toReference),
    runs: pageRuns.filter((run) => withItems.has(run.id)),
    items,
    nextBefore,
    refunded: typeof sweep.data === 'number' ? sweep.data : 0,
  };
}

export type ClaimResult =
  | { result: 'claimed'; credits: number; balance: number }
  | { result: 'insufficient_credits'; needed: number; balance: number }
  | { result: 'not_claimable'; status: string }
  | { result: 'not_found' };

export async function claimItem(db: Db, itemId: string, userId: string): Promise<ClaimResult> {
  const { data, error } = await db.rpc('playground_claim_item', { p_item_id: itemId, p_user_id: userId });
  assertDb(error, 'start the image');
  return data as ClaimResult;
}

/** Fails (or re-queues) a generating image and refunds its credits; returns the refund. */
export async function releaseItem(db: Db, itemId: string, userId: string, status: 'queued' | 'failed', message: string): Promise<number> {
  const { data, error } = await db.rpc('playground_release_item', {
    p_item_id: itemId,
    p_user_id: userId,
    p_status: status,
    p_error: message,
  });
  if (error) {
    console.error('Playground: release failed:', error);
    return 0;
  }
  return typeof data === 'number' ? data : 0;
}

const STORAGE_PUBLIC = '/storage/v1/object/public/';

/** The bucket and object path of one of our public storage URLs, or null for anything else. */
export function storageObject(url: string | null | undefined): { bucket: string; path: string } | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!url || !base || !url.startsWith(`${base}${STORAGE_PUBLIC}`)) return null;
  const rest = url.slice(`${base}${STORAGE_PUBLIC}`.length).split('?')[0];
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  return { bucket: rest.slice(0, slash), path: decodeURIComponent(rest.slice(slash + 1)) };
}

/** Only images uploaded to our own buckets can become references. */
export function isOwnStorageUrl(url: string): boolean {
  const object = storageObject(url);
  return Boolean(object && ['source-images', 'generated-thumbnails'].includes(object.bucket));
}

/** Deletes stored files (best effort); files still used as a reference are kept. */
export async function removeStoredFiles(db: Db, urls: Array<string | null | undefined>, keep: Set<string> = new Set()): Promise<void> {
  const byBucket = new Map<string, string[]>();
  for (const url of urls) {
    if (!url || keep.has(url)) continue;
    const object = storageObject(url);
    if (!object) continue;
    byBucket.set(object.bucket, [...(byBucket.get(object.bucket) ?? []), object.path]);
  }
  await Promise.all([...byBucket].map(async ([bucket, paths]) => {
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (error) console.warn(`Playground: could not remove files from ${bucket}:`, error.message);
    }
  }));
}
