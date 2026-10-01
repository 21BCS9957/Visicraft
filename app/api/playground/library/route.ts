import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, assertDb, readJson, withUser } from '@/lib/server/playground/http';
import { isOwnStorageUrl, LIBRARY_COLUMNS, playgroundDb, toLibraryItem } from '@/lib/server/playground/db';
import { MAX_BRIEF_CHARS } from '@/lib/playground/prompts';

const PAGE = 60;
const MAX_ITEMS = 2000;
const SOURCES = ['upload', 'generated', 'project'] as const;
type Source = (typeof SOURCES)[number];

const source = (value: unknown): Source => (SOURCES.includes(value as Source) ? (value as Source) : 'upload');
const size = (value: unknown) => (typeof value === 'number' && value > 0 ? Math.round(value) : null);

/** The user's Library: ?kind=image|document, newest first, with ?before= for more and ?q= to search names. */
export async function GET(request: NextRequest) {
  try {
    const user = await withUser(request);
    const params = request.nextUrl.searchParams;
    const kind = params.get('kind') === 'document' ? 'document' : 'image';
    let query = playgroundDb()
      .from('playground_library')
      .select(kind === 'document' ? `${LIBRARY_COLUMNS}, content` : LIBRARY_COLUMNS)
      .eq('user_id', user.id)
      .eq('kind', kind)
      .order('created_at', { ascending: false })
      .limit(PAGE + 1);
    const before = params.get('before');
    if (before) query = query.lt('created_at', before);
    const search = params.get('q')?.trim();
    if (search) query = query.ilike('name', `%${search.replace(/[%_]/g, '')}%`);
    const { data, error } = await query;
    assertDb(error, 'load your library');
    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    const items = rows.slice(0, PAGE).map((row) => toLibraryItem(row));
    return NextResponse.json({ items, nextBefore: rows.length > PAGE ? items[items.length - 1]?.createdAt ?? null : null });
  } catch (error) {
    return apiErrorResponse(error, 'Could not load your library');
  }
}

/**
 * Adds to the Library: images already uploaded to our storage
 * ({ images: [{ url, name, width, height, mimeType, sizeBytes, source }] }) or one guideline
 * document ({ document: { name, content, source } }).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await withUser(request);
    const body = await readJson<{
      images?: Array<{ url?: unknown; name?: unknown; width?: unknown; height?: unknown; mimeType?: unknown; sizeBytes?: unknown; source?: unknown }>;
      document?: { name?: unknown; content?: unknown; source?: unknown };
    }>(request);
    const db = playgroundDb();

    let rows: Array<Record<string, unknown>> = [];
    if (body.document) {
      const content = typeof body.document.content === 'string' ? body.document.content : '';
      if (!content.trim()) throw new ApiError(400, 'The document is empty.', 'bad_request');
      if (content.length > MAX_BRIEF_CHARS) throw new ApiError(400, `Documents can be up to ${MAX_BRIEF_CHARS.toLocaleString('en-IN')} characters.`, 'too_large');
      const name = typeof body.document.name === 'string' && body.document.name.trim() ? body.document.name.trim().slice(0, 160) : 'Guidelines.md';
      rows = [{ user_id: user.id, kind: 'document', name, content, mime_type: 'text/markdown', size_bytes: content.length, source: source(body.document.source) }];
    } else {
      const images = Array.isArray(body.images) ? body.images.slice(0, 50) : [];
      if (!images.length) throw new ApiError(400, 'Nothing to add.', 'bad_request');
      rows = images.map((image) => {
        if (typeof image.url !== 'string' || !isOwnStorageUrl(image.url)) {
          throw new ApiError(400, 'Library images must be uploaded first.', 'bad_request');
        }
        return {
          user_id: user.id,
          kind: 'image',
          url: image.url,
          name: typeof image.name === 'string' ? image.name.trim().slice(0, 160) : '',
          width: size(image.width),
          height: size(image.height),
          mime_type: typeof image.mimeType === 'string' ? image.mimeType : null,
          size_bytes: size(image.sizeBytes),
          source: source(image.source),
        };
      });
    }

    const existing = await db.from('playground_library').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
    assertDb(existing.error, 'check your library');
    if ((existing.count ?? 0) + rows.length > MAX_ITEMS) {
      throw new ApiError(400, `Your library can hold up to ${MAX_ITEMS.toLocaleString('en-IN')} items. Delete some first.`, 'too_many');
    }

    const { data, error } = await db.from('playground_library').insert(rows).select(`${LIBRARY_COLUMNS}, content`);
    assertDb(error, 'add to your library');
    return NextResponse.json({ items: ((data ?? []) as Array<Record<string, unknown>>).map((row) => toLibraryItem(row)) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not add to your library');
  }
}
