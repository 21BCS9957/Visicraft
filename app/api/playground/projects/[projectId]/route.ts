import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, assertDb, readJson, requireUuid, withUser } from '@/lib/server/playground/http';
import { getOwnedProject, loadProjectBundle, playgroundDb, removeStoredFiles, toProject } from '@/lib/server/playground/db';
import { isPlaygroundModel } from '@/lib/playground/models';
import { MAX_BRIEF_CHARS, MAX_VARIATIONS } from '@/lib/playground/prompts';

type Context = { params: Promise<{ projectId: string }> };

/** The project with its references and its latest runs (older ones with ?before=). */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const projectId = requireUuid((await params).projectId, 'project');
    const before = request.nextUrl.searchParams.get('before');
    const bundle = await loadProjectBundle(playgroundDb(), user.id, projectId, before);
    return NextResponse.json(bundle);
  } catch (error) {
    return apiErrorResponse(error, 'Could not load the project');
  }
}

/** Renames the project, saves its brief, or remembers the composer's settings. */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const projectId = requireUuid((await params).projectId, 'project');
    const body = await readJson<{ name?: unknown; brief?: unknown; settings?: unknown }>(request);
    const db = playgroundDb();
    await getOwnedProject(db, projectId, user.id);

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.name === 'string') {
      const name = body.name.trim().slice(0, 120);
      if (!name) throw new ApiError(400, 'The project needs a name.', 'bad_request');
      update.name = name;
    }
    if (typeof body.brief === 'string') update.brief = body.brief.slice(0, MAX_BRIEF_CHARS);
    if (body.settings && typeof body.settings === 'object') {
      const settings = body.settings as Record<string, unknown>;
      update.settings = {
        model: isPlaygroundModel(settings.model) ? settings.model : undefined,
        size: typeof settings.size === 'string' ? settings.size : undefined,
        ratios: Array.isArray(settings.ratios) ? settings.ratios.filter((ratio) => typeof ratio === 'string').slice(0, 14) : undefined,
        variations: typeof settings.variations === 'number' ? Math.min(MAX_VARIATIONS, Math.max(1, Math.round(settings.variations))) : undefined,
        thinking: settings.thinking === 'high' ? 'high' : 'minimal',
      };
    }

    const { data, error } = await db
      .from('playground_projects')
      .update(update)
      .eq('id', projectId)
      .eq('user_id', user.id)
      .select('*')
      .single();
    assertDb(error, 'save the project');
    return NextResponse.json({ project: toProject(data as Record<string, unknown>) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not save the project');
  }
}

/** Deletes the project, its runs and images, and their stored files. */
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const projectId = requireUuid((await params).projectId, 'project');
    const db = playgroundDb();
    await getOwnedProject(db, projectId, user.id);

    const generating = await db
      .from('playground_items')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'generating');
    assertDb(generating.error, 'check the project');
    if ((generating.count ?? 0) > 0) {
      throw new ApiError(409, 'Some images are still being made. Cancel the run or wait a minute, then delete.', 'busy');
    }

    const [items, references] = await Promise.all([
      db.from('playground_items').select('image_url, preview_url').eq('project_id', projectId),
      db.from('playground_references').select('url').eq('project_id', projectId),
    ]);
    assertDb(items.error, 'list the images');
    assertDb(references.error, 'list the references');

    const { error } = await db.from('playground_projects').delete().eq('id', projectId).eq('user_id', user.id);
    assertDb(error, 'delete the project');

    const files = [
      ...((items.data ?? []) as Array<{ image_url: string | null; preview_url: string | null }>).flatMap((row) => [row.image_url, row.preview_url]),
      ...((references.data ?? []) as Array<{ url: string }>).map((row) => row.url),
    ];
    await removeStoredFiles(db, files);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiErrorResponse(error, 'Could not delete the project');
  }
}
