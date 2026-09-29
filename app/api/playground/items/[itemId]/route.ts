import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, assertDb, readJson, requireUuid, withUser } from '@/lib/server/playground/http';
import { getOwnedItem, ITEM_COLUMNS, playgroundDb, removeStoredFiles, toItem } from '@/lib/server/playground/db';

type Context = { params: Promise<{ itemId: string }> };

/**
 * One image's current state (the browser checks it after a dropped connection). With
 * ?full=1 (the Canvas), also its saved layers, the run's model and size, and its prompt.
 */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const itemId = requireUuid((await params).itemId, 'image');
    const db = playgroundDb();
    const row = await getOwnedItem(db, itemId, user.id, `${ITEM_COLUMNS}, project_id`);
    if (request.nextUrl.searchParams.get('full') !== '1') return NextResponse.json({ item: toItem(row) });

    const [project, run] = await Promise.all([
      db.from('playground_projects').select('id, name').eq('id', row.project_id as string).single(),
      row.run_id
        ? db.from('playground_runs').select('model, image_size, prompts').eq('id', row.run_id as string).single()
        : Promise.resolve({ data: null, error: null }),
    ]);
    assertDb(project.error, 'load the project');
    const runData = run.data as { model: string; image_size: string; prompts: string[] } | null;
    return NextResponse.json({
      item: toItem(row),
      canvasDoc: row.canvas_doc ?? null,
      project: project.data,
      model: runData?.model ?? null,
      size: runData?.image_size ?? null,
      prompt: runData?.prompts?.[Number(row.prompt_index)] ?? null,
    });
  } catch (error) {
    return apiErrorResponse(error, 'Could not load the image');
  }
}

/** Favourite / unfavourite, or put a cancelled image back in the queue ({ requeue: true }). */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const itemId = requireUuid((await params).itemId, 'image');
    const body = await readJson<{ favorite?: unknown; requeue?: unknown }>(request);
    const db = playgroundDb();

    let query;
    if (body.requeue === true) {
      query = db.from('playground_items')
        .update({ status: 'queued', finished_at: null, error: null })
        .eq('id', itemId).eq('user_id', user.id).eq('status', 'cancelled');
    } else if (typeof body.favorite === 'boolean') {
      query = db.from('playground_items').update({ favorite: body.favorite }).eq('id', itemId).eq('user_id', user.id);
    } else {
      throw new ApiError(400, 'Nothing to change.', 'bad_request');
    }
    const { data, error } = await query.select(ITEM_COLUMNS).maybeSingle();
    assertDb(error, 'update the image');
    if (!data) {
      const current = await getOwnedItem(db, itemId, user.id, ITEM_COLUMNS);
      return NextResponse.json({ item: toItem(current) });
    }
    return NextResponse.json({ item: toItem(data as unknown as Record<string, unknown>) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not update the image');
  }
}

/**
 * Deletes an image and its files (files a reference still uses are kept). A run left with
 * no images is deleted too, and the project's cover moves to its newest remaining image.
 */
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const itemId = requireUuid((await params).itemId, 'image');
    const db = playgroundDb();
    const item = await getOwnedItem(db, itemId, user.id, 'id, project_id, run_id, status, image_url, preview_url');
    if (item.status === 'generating') {
      throw new ApiError(409, 'This image is still being made. Delete it when it finishes.', 'busy');
    }
    const { error } = await db.from('playground_items').delete().eq('id', itemId).eq('user_id', user.id);
    assertDb(error, 'delete the image');

    let runDeleted = false;
    if (typeof item.run_id === 'string') {
      const left = await db.from('playground_items').select('id', { count: 'exact', head: true }).eq('run_id', item.run_id);
      if (!left.error && (left.count ?? 0) === 0) {
        const removed = await db.from('playground_runs').delete().eq('id', item.run_id).eq('user_id', user.id);
        runDeleted = !removed.error;
      }
    }

    const project = await db.from('playground_projects').select('cover_url').eq('id', item.project_id as string).single();
    if (!project.error && project.data?.cover_url && project.data.cover_url === item.preview_url) {
      const newest = await db
        .from('playground_items')
        .select('preview_url')
        .eq('project_id', item.project_id as string)
        .eq('status', 'done')
        .not('preview_url', 'is', null)
        .order('finished_at', { ascending: false })
        .limit(1);
      await db.from('playground_projects').update({ cover_url: newest.data?.[0]?.preview_url ?? null }).eq('id', item.project_id as string);
    }

    const imageUrl = typeof item.image_url === 'string' ? item.image_url : null;
    const keep = new Set<string>();
    if (imageUrl) {
      const used = await db.from('playground_references').select('id').eq('url', imageUrl).limit(1);
      if (used.data?.length) keep.add(imageUrl);
    }
    await removeStoredFiles(db, [imageUrl, item.preview_url as string | null], keep);
    return NextResponse.json({ deleted: true, runDeleted });
  } catch (error) {
    return apiErrorResponse(error, 'Could not delete the image');
  }
}
