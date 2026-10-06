import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, assertDb, isUuid, readJson, requireUuid, withUser } from '@/lib/server/playground/http';
import {
  isMissingLibraryVideoSetup,
  LEGACY_LIBRARY_COLUMNS,
  LIBRARY_COLUMNS,
  LIBRARY_VIDEO_SETUP_MESSAGE,
  libraryKind,
  playgroundDb,
  removeStoredFiles,
  requireLibraryFolder,
  toLibraryItem,
} from '@/lib/server/playground/db';
import { readLibraryFrames } from '@/lib/server/referenceVideos';

type Context = { params: Promise<{ itemId: string }> };
type Row = Record<string, unknown>;

async function ownedItem(itemId: string, userId: string): Promise<Row> {
  const load = (columns: string) => playgroundDb()
    .from('playground_library')
    .select(`${columns}, content`)
    .eq('id', itemId)
    .eq('user_id', userId)
    .maybeSingle();
  let { data, error } = await load(`${LIBRARY_COLUMNS}, frames`);
  if (isMissingLibraryVideoSetup(error)) ({ data, error } = await load(LEGACY_LIBRARY_COLUMNS));
  assertDb(error, 'load the library item');
  if (!data) throw new ApiError(404, 'Library item not found.', 'not_found');
  return data as unknown as Row;
}

/** One item; documents come with their full Markdown. */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const row = await ownedItem(requireUuid((await params).itemId, 'library item'), user.id);
    return NextResponse.json({ item: toLibraryItem(row), content: typeof row.content === 'string' ? row.content : null });
  } catch (error) {
    return apiErrorResponse(error, 'Could not load the library item');
  }
}

/** Renames an item ({ name }) and/or files it in a folder ({ folderId }, null to un-file it). */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const itemId = requireUuid((await params).itemId, 'library item');
    const body = await readJson<{ name?: unknown; folderId?: unknown }>(request);
    const db = playgroundDb();
    const patch: Row = {};
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) throw new ApiError(400, 'Give it a name.', 'bad_request');
      patch.name = body.name.trim().slice(0, 160);
    }
    if (body.folderId !== undefined) {
      if (body.folderId !== null && !isUuid(body.folderId)) throw new ApiError(400, 'Invalid folder.', 'bad_request');
      if (body.folderId !== null) {
        const row = await ownedItem(itemId, user.id);
        await requireLibraryFolder(db, user.id, body.folderId, libraryKind(row.kind));
      }
      patch.folder_id = body.folderId;
    }
    if (!Object.keys(patch).length) throw new ApiError(400, 'Nothing to change.', 'bad_request');
    const update = (columns: string) => db
      .from('playground_library')
      .update(patch)
      .eq('id', itemId)
      .eq('user_id', user.id)
      .select(columns)
      .maybeSingle();
    let { data, error } = await update(LIBRARY_COLUMNS);
    if (isMissingLibraryVideoSetup(error)) {
      if ('folder_id' in patch) throw new ApiError(409, LIBRARY_VIDEO_SETUP_MESSAGE, 'setup');
      ({ data, error } = await update(LEGACY_LIBRARY_COLUMNS));
    }
    assertDb(error, 'update the library item');
    if (!data) throw new ApiError(404, 'Library item not found.', 'not_found');
    return NextResponse.json({ item: toLibraryItem(data as unknown as Row) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not update the library item');
  }
}

/**
 * Removes an item. An uploaded image's file is kept while a project still uses it; an
 * uploaded video goes with its poster and frames. Rendered videos keep their file (the Video
 * Studio still shows them).
 */
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const itemId = requireUuid((await params).itemId, 'library item');
    const db = playgroundDb();
    const row = await ownedItem(itemId, user.id);
    const { error } = await db.from('playground_library').delete().eq('id', itemId).eq('user_id', user.id);
    assertDb(error, 'remove the library item');

    const url = typeof row.url === 'string' ? row.url : null;
    if (row.kind === 'video') {
      const stills = [typeof row.poster_url === 'string' ? row.poster_url : null, ...readLibraryFrames(row.frames).map((frame) => frame.url)];
      const { data: others } = url ? await db.from('playground_library').select('id').eq('url', url).limit(1) : { data: [] };
      const files = row.source === 'upload' && !others?.length ? [url, ...stills] : stills;
      await removeStoredFiles(db, files);
    } else if (url && row.source === 'upload') {
      const [references, items, library] = await Promise.all([
        db.from('playground_references').select('id').eq('url', url).limit(1),
        db.from('playground_items').select('id').eq('image_url', url).limit(1),
        db.from('playground_library').select('id').eq('url', url).limit(1),
      ]);
      const inUse = Boolean(references.data?.length || items.data?.length || library.data?.length);
      if (!inUse) await removeStoredFiles(db, [url]);
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiErrorResponse(error, 'Could not remove the library item');
  }
}
