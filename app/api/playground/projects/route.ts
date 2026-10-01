import { NextRequest, NextResponse } from 'next/server';
import { ApiError, assertDb, apiErrorResponse, readJson, withUser } from '@/lib/server/playground/http';
import { isMissingKindColumn, playgroundDb, toProject, VIDEO_SETUP_MESSAGE } from '@/lib/server/playground/db';
import type { PlaygroundProjectSummary, ProjectKind } from '@/lib/playground/types';

const count = (value: unknown) => Number((value as Array<{ count: number }> | undefined)?.[0]?.count ?? 0);

/** The signed-in user's image projects (or `?kind=video` video projects), most recently used first. */
export async function GET(request: NextRequest) {
  try {
    const user = await withUser(request);
    const kind: ProjectKind = request.nextUrl.searchParams.get('kind') === 'video' ? 'video' : 'image';
    const db = playgroundDb();

    if (kind === 'video') {
      const { data, error } = await db
        .from('playground_projects')
        .select('id, name, cover_url, updated_at')
        .eq('user_id', user.id)
        .eq('kind', 'video')
        .order('updated_at', { ascending: false })
        .limit(200);
      if (isMissingKindColumn(error)) return NextResponse.json({ projects: [], setup: VIDEO_SETUP_MESSAGE });
      assertDb(error, 'load your video projects');
      // Each video's usage row names its project.
      const videos = await db
        .from('usage_logs')
        .select('project:metadata->>projectId')
        .eq('user_id', user.id)
        .eq('feature', 'video_generation')
        .in('metadata->>mode', ['video_review', 'product_video_ad', 'img2vid'])
        .not('metadata->>projectId', 'is', null)
        .limit(2000);
      const perProject = new Map<string, number>();
      for (const row of (videos.data ?? []) as Array<{ project: string | null }>) {
        if (row.project) perProject.set(row.project, (perProject.get(row.project) ?? 0) + 1);
      }
      const projects: PlaygroundProjectSummary[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        coverUrl: (row.cover_url as string | null) ?? null,
        imageCount: 0,
        referenceCount: 0,
        videoCount: perProject.get(row.id as string) ?? 0,
        updatedAt: row.updated_at as string,
      }));
      return NextResponse.json({ projects });
    }

    const images = (filterKind: boolean) => {
      let query = db
        .from('playground_projects')
        .select('id, name, cover_url, updated_at, playground_references(count), playground_items(count)')
        .eq('user_id', user.id)
        .eq('playground_items.status', 'done');
      if (filterKind) query = query.eq('kind', 'image');
      return query.order('updated_at', { ascending: false }).limit(200);
    };
    let { data, error } = await images(true);
    // Before the video-projects migration every project is an image project.
    if (isMissingKindColumn(error)) ({ data, error } = await images(false));
    assertDb(error, 'load your projects');

    const projects: PlaygroundProjectSummary[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      coverUrl: (row.cover_url as string | null) ?? null,
      imageCount: count(row.playground_items),
      referenceCount: count(row.playground_references),
      updatedAt: row.updated_at as string,
    }));
    return NextResponse.json({ projects });
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
