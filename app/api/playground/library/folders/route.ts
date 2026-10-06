import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, assertDb, readJson, withUser } from '@/lib/server/playground/http';
import { folderName, isMissingLibraryVideoSetup, LIBRARY_VIDEO_SETUP_MESSAGE, libraryKind, playgroundDb, toLibraryFolder } from '@/lib/server/playground/db';

const MAX_FOLDERS = 100;

/** The folders of one Library tab (?kind=image|document|video), by name, with how many items each holds. */
export async function GET(request: NextRequest) {
  try {
    const user = await withUser(request);
    const kind = libraryKind(request.nextUrl.searchParams.get('kind'));
    const db = playgroundDb();
    const [folders, filed] = await Promise.all([
      db.from('playground_library_folders').select('id, kind, name, created_at').eq('user_id', user.id).eq('kind', kind).order('name'),
      db.from('playground_library').select('folder_id').eq('user_id', user.id).eq('kind', kind).not('folder_id', 'is', null),
    ]);
    if (isMissingLibraryVideoSetup(folders.error) || isMissingLibraryVideoSetup(filed.error)) {
      return NextResponse.json({ folders: [], setupMessage: LIBRARY_VIDEO_SETUP_MESSAGE });
    }
    assertDb(folders.error, 'load your folders');
    assertDb(filed.error, 'load your folders');
    const counts = new Map<string, number>();
    for (const row of (filed.data ?? []) as Array<{ folder_id: string | null }>) {
      if (row.folder_id) counts.set(row.folder_id, (counts.get(row.folder_id) ?? 0) + 1);
    }
    return NextResponse.json({
      folders: ((folders.data ?? []) as Array<Record<string, unknown>>).map((row) => toLibraryFolder(row, counts.get(String(row.id)) ?? 0)),
      setupMessage: null,
    });
  } catch (error) {
    return apiErrorResponse(error, 'Could not load your folders');
  }
}

/** A new folder in one Library tab ({ kind, name }); a name already used there returns that folder. */
export async function POST(request: NextRequest) {
  try {
    const user = await withUser(request);
    const body = await readJson<{ kind?: unknown; name?: unknown }>(request);
    const kind = libraryKind(body.kind);
    const name = folderName(body.name);
    const db = playgroundDb();
    const existing = await db.from('playground_library_folders').select('id, kind, name, created_at').eq('user_id', user.id).eq('kind', kind);
    if (isMissingLibraryVideoSetup(existing.error)) throw new ApiError(409, LIBRARY_VIDEO_SETUP_MESSAGE, 'setup');
    assertDb(existing.error, 'check your folders');
    const rows = (existing.data ?? []) as Array<Record<string, unknown>>;
    const same = rows.find((row) => String(row.name).toLowerCase() === name.toLowerCase());
    if (same) return NextResponse.json({ folder: toLibraryFolder(same), existed: true });
    if (rows.length >= MAX_FOLDERS) throw new ApiError(400, `A Library tab can have up to ${MAX_FOLDERS} folders.`, 'too_many');
    const { data, error } = await db
      .from('playground_library_folders')
      .insert({ user_id: user.id, kind, name })
      .select('id, kind, name, created_at')
      .single();
    if (error?.code === '23505') throw new ApiError(409, 'A folder with that name already exists.', 'conflict');
    assertDb(error, 'create the folder');
    return NextResponse.json({ folder: toLibraryFolder(data as Record<string, unknown>), existed: false });
  } catch (error) {
    return apiErrorResponse(error, 'Could not create the folder');
  }
}
