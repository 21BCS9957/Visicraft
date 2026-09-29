import { NextRequest, NextResponse } from 'next/server';
import { assertDb, apiErrorResponse, readJson, withUser } from '@/lib/server/playground/http';
import { playgroundDb, toProject } from '@/lib/server/playground/db';
import type { PlaygroundProjectSummary } from '@/lib/playground/types';

/** The signed-in user's projects, most recently used first. */
export async function GET(request: NextRequest) {
  try {
    const user = await withUser(request);
    const db = playgroundDb();
    const { data, error } = await db
      .from('playground_projects')
      .select('id, name, cover_url, updated_at, playground_references(count), playground_items(count)')
      .eq('user_id', user.id)
      .eq('playground_items.status', 'done')
      .order('updated_at', { ascending: false })
      .limit(200);
    assertDb(error, 'load your projects');

    const count = (value: unknown) => Number((value as Array<{ count: number }> | undefined)?.[0]?.count ?? 0);
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
    const body = await readJson<{ name?: unknown }>(request);
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : 'Untitled project';
    const { data, error } = await playgroundDb()
      .from('playground_projects')
      .insert({ user_id: user.id, name })
      .select('*')
      .single();
    assertDb(error, 'create the project');
    return NextResponse.json({ project: toProject(data as Record<string, unknown>) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not create the project');
  }
}
