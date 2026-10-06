import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, assertDb, isUuid, readJson, withUser } from '@/lib/server/playground/http';
import {
  isMissingLibraryVideoSetup,
  isOwnStorageUrl,
  isOwnVideoUrl,
  LEGACY_LIBRARY_COLUMNS,
  LIBRARY_COLUMNS,
  LIBRARY_VIDEO_SETUP_MESSAGE,
  libraryKind,
  playgroundDb,
  requireLibraryFolder,
  toLibraryItem,
} from '@/lib/server/playground/db';
import { MAX_BRIEF_CHARS } from '@/lib/playground/prompts';
import { MAX_LIBRARY_VIDEO_SECONDS, VIDEO_FRAME_COUNT } from '@/lib/playground/libraryVideo';
import type { LibraryKind } from '@/lib/playground/types';

const PAGE = 60;
const MAX_ITEMS = 2000;
const SOURCES = ['upload', 'generated', 'project'] as const;
type Source = (typeof SOURCES)[number];
type Row = Record<string, unknown>;

const source = (value: unknown): Source => (SOURCES.includes(value as Source) ? (value as Source) : 'upload');
const size = (value: unknown) => (typeof value === 'number' && value > 0 ? Math.round(value) : null);
const name = (value: unknown, fallback = '') => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 160) : fallback);

/**
 * The user's Library: ?kind=image|document|video, newest first, with ?before= for more,
 * ?q= to search names and ?folder=<id> (or "none") for one folder.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await withUser(request);
    const params = request.nextUrl.searchParams;
    const kind = libraryKind(params.get('kind'));
    const folder = params.get('folder');
    const list = (columns: string, filed: boolean) => {
      let query = playgroundDb()
        .from('playground_library')
        .select(kind === 'document' ? `${columns}, content` : columns)
        .eq('user_id', user.id)
        .eq('kind', kind)
        .order('created_at', { ascending: false })
        .limit(PAGE + 1);
      const before = params.get('before');
      if (before) query = query.lt('created_at', before);
      const search = params.get('q')?.trim();
      if (search) query = query.ilike('name', `%${search.replace(/[%_]/g, '')}%`);
      if (filed && folder === 'none') query = query.is('folder_id', null);
      else if (filed && isUuid(folder)) query = query.eq('folder_id', folder);
      return query;
    };
    let { data, error } = await list(LIBRARY_COLUMNS, true);
    let setupMessage: string | null = null;
    if (isMissingLibraryVideoSetup(error)) {
      // Before migration 202610060001: images and documents still list; videos and folders wait for it.
      setupMessage = LIBRARY_VIDEO_SETUP_MESSAGE;
      if (kind === 'video') return NextResponse.json({ items: [], nextBefore: null, setupMessage });
      ({ data, error } = await list(LEGACY_LIBRARY_COLUMNS, false));
    }
    assertDb(error, 'load your library');
    const rows = (data ?? []) as unknown as Row[];
    const items = rows.slice(0, PAGE).map((row) => toLibraryItem(row));
    return NextResponse.json({ items, nextBefore: rows.length > PAGE ? items[items.length - 1]?.createdAt ?? null : null, setupMessage });
  } catch (error) {
    return apiErrorResponse(error, 'Could not load your library');
  }
}

/** One frame taken in the browser, in our storage. */
function readFrames(value: unknown): Array<{ url: string; t: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, VIDEO_FRAME_COUNT)
    .map((frame) => (frame && typeof frame === 'object' ? (frame as Row) : {}))
    .filter((frame) => typeof frame.url === 'string' && isOwnStorageUrl(frame.url) && Number.isFinite(Number(frame.t)))
    .map((frame) => ({ url: frame.url as string, t: Math.max(0, Math.round(Number(frame.t) * 100) / 100) }));
}

/**
 * Adds to the Library, into `folderId` when given: images already uploaded to our storage
 * ({ images: [{ url, name, width, height, mimeType, sizeBytes, source }] }), videos with the
 * poster and frames the browser took ({ videos: [{ url, name, posterUrl, durationSeconds,
 * width, height, mimeType, sizeBytes, frames: [{ url, t }], source }] }) or one guideline
 * document ({ document: { name, content, source } }).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await withUser(request);
    const body = await readJson<{
      images?: Array<{ url?: unknown; name?: unknown; width?: unknown; height?: unknown; mimeType?: unknown; sizeBytes?: unknown; source?: unknown }>;
      videos?: Array<{ url?: unknown; name?: unknown; posterUrl?: unknown; durationSeconds?: unknown; width?: unknown; height?: unknown; mimeType?: unknown; sizeBytes?: unknown; frames?: unknown; source?: unknown }>;
      document?: { name?: unknown; content?: unknown; source?: unknown };
      folderId?: unknown;
    }>(request);
    const db = playgroundDb();

    let kind: LibraryKind = 'image';
    let rows: Row[] = [];
    if (body.document) {
      kind = 'document';
      const content = typeof body.document.content === 'string' ? body.document.content : '';
      if (!content.trim()) throw new ApiError(400, 'The document is empty.', 'bad_request');
      if (content.length > MAX_BRIEF_CHARS) throw new ApiError(400, `Documents can be up to ${MAX_BRIEF_CHARS.toLocaleString('en-IN')} characters.`, 'too_large');
      rows = [{ user_id: user.id, kind, name: name(body.document.name, 'Guidelines.md'), content, mime_type: 'text/markdown', size_bytes: content.length, source: source(body.document.source) }];
    } else if (Array.isArray(body.videos)) {
      kind = 'video';
      const videos = body.videos.slice(0, 10);
      if (!videos.length) throw new ApiError(400, 'Nothing to add.', 'bad_request');
      rows = videos.map((video) => {
        if (typeof video.url !== 'string' || !isOwnVideoUrl(video.url)) {
          throw new ApiError(400, 'Library videos must be uploaded first.', 'bad_request');
        }
        const duration = Number(video.durationSeconds);
        if (Number.isFinite(duration) && duration > MAX_LIBRARY_VIDEO_SECONDS + 1) {
          throw new ApiError(400, `Videos can be up to ${MAX_LIBRARY_VIDEO_SECONDS / 60} minutes long.`, 'too_large');
        }
        const poster = typeof video.posterUrl === 'string' && isOwnStorageUrl(video.posterUrl) ? video.posterUrl : null;
        return {
          user_id: user.id,
          kind,
          url: video.url,
          name: name(video.name, 'Video'),
          poster_url: poster,
          duration_seconds: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 100) / 100 : null,
          frames: readFrames(video.frames),
          width: size(video.width),
          height: size(video.height),
          mime_type: typeof video.mimeType === 'string' ? video.mimeType : null,
          size_bytes: size(video.sizeBytes),
          source: source(video.source),
        };
      });
    } else {
      const images = Array.isArray(body.images) ? body.images.slice(0, 50) : [];
      if (!images.length) throw new ApiError(400, 'Nothing to add.', 'bad_request');
      rows = images.map((image) => {
        if (typeof image.url !== 'string' || !isOwnStorageUrl(image.url)) {
          throw new ApiError(400, 'Library images must be uploaded first.', 'bad_request');
        }
        return {
          user_id: user.id,
          kind,
          url: image.url,
          name: name(image.name),
          width: size(image.width),
          height: size(image.height),
          mime_type: typeof image.mimeType === 'string' ? image.mimeType : null,
          size_bytes: size(image.sizeBytes),
          source: source(image.source),
        };
      });
    }

    if (body.folderId !== undefined && body.folderId !== null) {
      if (!isUuid(body.folderId)) throw new ApiError(400, 'Invalid folder.', 'bad_request');
      await requireLibraryFolder(db, user.id, body.folderId, kind);
      rows = rows.map((row) => ({ ...row, folder_id: body.folderId }));
    }

    const existing = await db.from('playground_library').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
    assertDb(existing.error, 'check your library');
    if ((existing.count ?? 0) + rows.length > MAX_ITEMS) {
      throw new ApiError(400, `Your library can hold up to ${MAX_ITEMS.toLocaleString('en-IN')} items. Delete some first.`, 'too_many');
    }

    const legacy = kind !== 'video' && body.folderId == null;
    let { data, error } = await db.from('playground_library').insert(rows).select(`${LIBRARY_COLUMNS}, content`);
    if (isMissingLibraryVideoSetup(error) || (error?.code === '23514' && kind === 'video')) {
      if (!legacy) throw new ApiError(409, LIBRARY_VIDEO_SETUP_MESSAGE, 'setup');
      ({ data, error } = await db.from('playground_library').insert(rows).select(`${LEGACY_LIBRARY_COLUMNS}, content`));
    }
    assertDb(error, 'add to your library');
    return NextResponse.json({ items: ((data ?? []) as Row[]).map((row) => toLibraryItem(row)) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not add to your library');
  }
}
