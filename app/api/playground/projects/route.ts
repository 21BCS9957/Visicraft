import { NextRequest, NextResponse } from 'next/server';
import { ApiError, assertDb, apiErrorResponse, readJson, withUser } from '@/lib/server/playground/http';
import { isMissingKindColumn, listProjects, playgroundDb, toProject, VIDEO_SETUP_MESSAGE } from '@/lib/server/playground/db';
import type { ProjectKind } from '@/lib/playground/types';

/** The signed-in user's image projects (or `?kind=video` video projects), most recently used first. */
export async function GET(request: NextRequest) {
  try {
    const user = await withUser(request);
    const kind: ProjectKind = request.nextUrl.searchParams.get('kind') === 'video' ? 'video' : 'image';
    return NextResponse.json(await listProjects(playgroundDb(), user.id, kind));
  } catch (error) {
    return apiErrorResponse(error, 'Could not load your projects');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await withUser(request);
    const body = await readJson<{ name?: unknown; kind?: unknown }>(request);
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : 'Untitled project';
    const kind: ProjectKind = body.kind === 'video' ? 'video' : 'image';
    const db = playgroundDb();
    const insert = (withKind: boolean) => db
      .from('playground_projects')
      .insert(withKind ? { user_id: user.id, name, kind } : { user_id: user.id, name })
      .select('*')
      .single();
    let { data, error } = await insert(true);
    if (isMissingKindColumn(error)) {
      if (kind === 'video') throw new ApiError(503, VIDEO_SETUP_MESSAGE, 'setup');
      ({ data, error } = await insert(false));
    }
    assertDb(error, 'create the project');
    return NextResponse.json({ project: toProject(data as Record<string, unknown>) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not create the project');
  }
}
