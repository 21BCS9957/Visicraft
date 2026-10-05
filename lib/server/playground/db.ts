import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import { playgroundModel } from '@/lib/playground/models';
import type {
  LibraryItem,
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
    briefName: strOrNull(row.brief_name),
    settings: (row.settings as PlaygroundProject['settings']) ?? {},
    // Rows from before the video-projects migration have no kind: they are image projects.
    kind: row.kind === 'video' ? 'video' : 'image',
    coverUrl: strOrNull(row.cover_url),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

/** The `kind` column is missing: supabase/migrations/202610010002_video_projects.sql hasn't been run. */
export function isMissingKindColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (error.code === '42703' || error.code === 'PGRST204' || /does not exist|could not find/i.test(error.message ?? '')) && /\bkind\b/.test(error.message ?? '');
}

export const VIDEO_SETUP_MESSAGE =
  'Video projects need one more database step. Run supabase/migrations/202610010002_video_projects.sql in the Supabase SQL Editor.';

/** The quality column (migration 202610050001) isn't there yet. */
export function isMissingQualityColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (error.code === '42703' || error.code === 'PGRST204' || /does not exist|could not find/i.test(error.message ?? '')) && /\bquality\b/.test(error.message ?? '');
}

export const QUALITY_SETUP_MESSAGE =
  'OpenAI image models need one more database step. Run supabase/migrations/202610050001_playground_quality.sql in the Supabase SQL Editor.';

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
    quality: (['high', 'xhigh', 'max'].includes(str(row.quality)) ? row.quality : null) as PlaygroundRun['quality'],
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

export const LIBRARY_COLUMNS = 'id, kind, name, url, width, height, mime_type, size_bytes, source, created_at';

export function toLibraryItem(row: Row, content?: string | null): LibraryItem {
  const text = typeof content === 'string' ? content : typeof row.content === 'string' ? row.content : null;
  return {
    id: str(row.id),
    kind: row.kind === 'document' ? 'document' : 'image',
    name: str(row.name),
    url: strOrNull(row.url),
    preview: text === null ? strOrNull(row.preview) : text.slice(0, 400),
    length: text === null ? numOrNull(row.length) : text.length,
    width: numOrNull(row.width),
    height: numOrNull(row.height),
    mimeType: strOrNull(row.mime_type),
    sizeBytes: numOrNull(row.size_bytes),
    source: (['upload', 'generated', 'project'].includes(str(row.source)) ? row.source : 'upload') as LibraryItem['source'],
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

/**
 * The project with its references, latest runs (each with its images) and Canvas edits, in
 * one parallel round of queries. The stale-image sweep runs alongside; when it failed and
 * refunded anything, the runs are read again so they show it.
 */
export async function loadProjectBundle(db: Db, userId: string, projectId: string, before?: string | null): Promise<PlaygroundBundle> {
  const loadRuns = () => {
    let query = db
      .from('playground_runs')
      .select(`*, playground_items(${ITEM_COLUMNS})`)
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('position', { referencedTable: 'playground_items', ascending: true })
      .limit(RUNS_PER_PAGE + 1);
    if (before) query = query.lt('created_at', before);
    return query;
  };
  const none = Promise.resolve({ data: [] as Row[], error: null });

  const [sweep, projectResult, referencesResult, runsResult, editsResult] = await Promise.all([
    db.rpc('playground_fail_stale_items', { p_user_id: userId, p_older_than_seconds: 600 }),
    db.from('playground_projects').select('*').eq('id', projectId).eq('user_id', userId).maybeSingle(),
    before
      ? none
      : db.from('playground_references').select('*').eq('project_id', projectId).eq('user_id', userId)
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    loadRuns(),
    before
      ? none
      : db.from('playground_items').select(ITEM_COLUMNS).eq('project_id', projectId).eq('user_id', userId).eq('kind', 'edit')
        .order('created_at', { ascending: false }).limit(100),
  ]);
  if (sweep.error && isSetupError(sweep.error)) throw new ApiError(503, SETUP_MESSAGE, 'setup');
  if (sweep.error) console.error('Playground: stale sweep failed:', sweep.error);
  assertDb(projectResult.error, 'load the project');
  if (!projectResult.data) throw new ApiError(404, 'Project not found.', 'not_found');
  assertDb(referencesResult.error, 'load the references');
  assertDb(runsResult.error, 'load the runs');
  assertDb(editsResult.error, 'load the edited images');

  const refunded = typeof sweep.data === 'number' ? sweep.data : 0;
  let runRows = (runsResult.data ?? []) as Row[];
  if (refunded > 0) {
    const again = await loadRuns();
    assertDb(again.error, 'load the runs');
    runRows = (again.data ?? []) as Row[];
  }

  const pageRows = runRows.slice(0, RUNS_PER_PAGE);
  const pageRuns = pageRows.map(toRun);
  const nextBefore = runRows.length > RUNS_PER_PAGE ? pageRuns[pageRuns.length - 1]?.createdAt ?? null : null;
  const items: PlaygroundItem[] = [
    ...pageRows.flatMap((row) => ((row.playground_items as Row[] | undefined) ?? []).map(toItem)),
    ...((editsResult.data ?? []) as unknown as Row[]).map(toItem),
  ];

  // A run whose images were all deleted has nothing to show.
  const withItems = new Set(items.map((item) => item.runId));
  return {
    project: toProject(projectResult.data as Row),
    references: ((referencesResult.data ?? []) as Row[]).map(toReference),
    runs: pageRuns.filter((run) => withItems.has(run.id)),
    items,
    nextBefore,
    refunded,
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
