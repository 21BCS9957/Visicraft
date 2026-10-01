import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, assertDb, readJson, requireUuid, withUser } from '@/lib/server/playground/http';
import { LIBRARY_COLUMNS, playgroundDb, removeStoredFiles, toLibraryItem } from '@/lib/server/playground/db';

type Context = { params: Promise<{ itemId: string }> };

async function ownedItem(itemId: string, userId: string) {
  const { data, error } = await playgroundDb()
    .from('playground_library')
    .select(`${LIBRARY_COLUMNS}, content`)
    .eq('id', itemId)
    .eq('user_id', userId)
    .maybeSingle();
  assertDb(error, 'load the library item');
  if (!data) throw new ApiError(404, 'Library item not found.', 'not_found');
  return data as Record<string, unknown>;
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

/** Renames an item. */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const itemId = requireUuid((await params).itemId, 'library item');
    const body = await readJson<{ name?: unknown }>(request);
    if (typeof body.name !== 'string' || !body.name.trim()) throw new ApiError(400, 'Give it a name.', 'bad_request');
    const { data, error } = await playgroundDb()
      .from('playground_library')
      .update({ name: body.name.trim().slice(0, 160) })
      .eq('id', itemId)
      .eq('user_id', user.id)
      .select(LIBRARY_COLUMNS)
      .maybeSingle();
    assertDb(error, 'rename the library item');
    if (!data) throw new ApiError(404, 'Library item not found.', 'not_found');
    return NextResponse.json({ item: toLibraryItem(data as Record<string, unknown>) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not rename the library item');
  }
}

/** Removes an item. An image's file is kept while a project still uses it. */
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const itemId = requireUuid((await params).itemId, 'library item');
    const db = playgroundDb();
    const row = await ownedItem(itemId, user.id);
    const { error } = await db.from('playground_library').delete().eq('id', itemId).eq('user_id', user.id);
    assertDb(error, 'remove the library item');

    const url = typeof row.url === 'string' ? row.url : null;
    if (url && row.source === 'upload') {
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
