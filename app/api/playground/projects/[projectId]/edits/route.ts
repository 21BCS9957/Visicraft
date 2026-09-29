import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import sharp from 'sharp';
import { ApiError, apiErrorResponse, assertDb, isUuid, readJson, requireUuid, withUser } from '@/lib/server/playground/http';
import { getOwnedItem, getOwnedProject, isOwnStorageUrl, ITEM_COLUMNS, playgroundDb, removeStoredFiles, toItem } from '@/lib/server/playground/db';
import { PLAYGROUND_BUCKET } from '@/lib/server/playground/images';
import { uploadBufferToBucket } from '@/lib/server/supabaseStorage';

type Context = { params: Promise<{ projectId: string }> };

const MAX_DOC_CHARS = 1_500_000;

/**
 * Saves a Canvas result to the project: { sourceItemId, editItemId?, imageUrl, canvasDoc }.
 * The flattened image (already uploaded by the browser) gets a gallery preview; the layers
 * are kept so the text stays editable. With editItemId, that edited image is updated.
 */
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const projectId = requireUuid((await params).projectId, 'project');
    const body = await readJson<{ sourceItemId?: unknown; editItemId?: unknown; imageUrl?: unknown; canvasDoc?: unknown }>(request);
    const db = playgroundDb();
    await getOwnedProject(db, projectId, user.id);

    const sourceItemId = requireUuid(body.sourceItemId, 'source image');
    const source = await getOwnedItem(db, sourceItemId, user.id, 'id, project_id, aspect_ratio, kind, parent_item_id');
    if (source.project_id !== projectId) throw new ApiError(400, 'That image belongs to another project.', 'bad_request');
    if (typeof body.imageUrl !== 'string' || !isOwnStorageUrl(body.imageUrl)) throw new ApiError(400, 'Upload the edited image first.', 'bad_request');
    const doc = body.canvasDoc && typeof body.canvasDoc === 'object' ? body.canvasDoc : null;
    if (doc && JSON.stringify(doc).length > MAX_DOC_CHARS) throw new ApiError(400, 'The design is too large to save.', 'too_large');

    const bytes = Buffer.from((await axios.get<ArrayBuffer>(body.imageUrl, { responseType: 'arraybuffer', timeout: 30_000 })).data);
    const meta = await sharp(bytes, { failOn: 'none' }).metadata();
    const preview = await sharp(bytes, { failOn: 'none' })
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const previewUrl = await uploadBufferToBucket(preview, PLAYGROUND_BUCKET, 'image/webp');
    const now = new Date().toISOString();
    const fields = {
      image_url: body.imageUrl,
      preview_url: previewUrl,
      width: meta.width ?? null,
      height: meta.height ?? null,
      mime_type: meta.format === 'png' ? 'image/png' : 'image/jpeg',
      canvas_doc: doc,
      finished_at: now,
    };

    let saved;
    if (isUuid(body.editItemId)) {
      const previous = await getOwnedItem(db, body.editItemId, user.id, 'id, project_id, kind, image_url, preview_url');
      if (previous.project_id !== projectId || previous.kind !== 'edit') throw new ApiError(400, 'Only edited images can be updated.', 'bad_request');
      const { data, error } = await db.from('playground_items').update(fields).eq('id', previous.id as string).select(ITEM_COLUMNS).single();
      assertDb(error, 'save the edit');
      saved = data;
      const replaced = [previous.image_url, previous.preview_url].filter((url) => url !== body.imageUrl) as string[];
      const used = await db.from('playground_references').select('url').in('url', replaced.length ? replaced : ['']);
      await removeStoredFiles(db, replaced, new Set(((used.data ?? []) as Array<{ url: string }>).map((row) => row.url)));
    } else {
      const { data, error } = await db
        .from('playground_items')
        .insert({
          ...fields,
          project_id: projectId,
          user_id: user.id,
          run_id: null,
          kind: 'edit',
          parent_item_id: source.kind === 'edit' && source.parent_item_id ? source.parent_item_id : source.id,
          position: 0,
          aspect_ratio: source.aspect_ratio,
          status: 'done',
          started_at: now,
        })
        .select(ITEM_COLUMNS)
        .single();
      assertDb(error, 'save the edit');
      saved = data;
    }

    await db.from('playground_projects').update({ cover_url: previewUrl, updated_at: now }).eq('id', projectId);
    return NextResponse.json({ item: toItem(saved as unknown as Record<string, unknown>) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not save the edit');
  }
}
