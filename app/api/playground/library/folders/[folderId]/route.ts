import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, assertDb, readJson, requireUuid, withUser } from '@/lib/server/playground/http';
import { folderName, isMissingLibraryVideoSetup, LIBRARY_VIDEO_SETUP_MESSAGE, playgroundDb, toLibraryFolder } from '@/lib/server/playground/db';

type Context = { params: Promise<{ folderId: string }> };

/** Renames a folder ({ name }). */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const folderId = requireUuid((await params).folderId, 'folder');
    const body = await readJson<{ name?: unknown }>(request);
    const { data, error } = await playgroundDb()
      .from('playground_library_folders')
      .update({ name: folderName(body.name) })
      .eq('id', folderId)
      .eq('user_id', user.id)
      .select('id, kind, name, created_at')
      .maybeSingle();
    if (isMissingLibraryVideoSetup(error)) throw new ApiError(409, LIBRARY_VIDEO_SETUP_MESSAGE, 'setup');
    if (error?.code === '23505') throw new ApiError(409, 'A folder with that name already exists.', 'conflict');
    assertDb(error, 'rename the folder');
    if (!data) throw new ApiError(404, 'That folder was not found.', 'not_found');
    return NextResponse.json({ folder: toLibraryFolder(data as Record<string, unknown>) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not rename the folder');
  }
}

/** Removes a folder. Its items stay in the Library, un-filed. */
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const folderId = requireUuid((await params).folderId, 'folder');
    const { error } = await playgroundDb().from('playground_library_folders').delete().eq('id', folderId).eq('user_id', user.id);
    if (isMissingLibraryVideoSetup(error)) throw new ApiError(409, LIBRARY_VIDEO_SETUP_MESSAGE, 'setup');
    assertDb(error, 'remove the folder');
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiErrorResponse(error, 'Could not remove the folder');
  }
}
