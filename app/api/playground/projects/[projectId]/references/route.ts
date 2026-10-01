import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, assertDb, isUuid, readJson, requireUuid, withUser } from '@/lib/server/playground/http';
import { getOwnedItem, getOwnedProject, isOwnStorageUrl, playgroundDb, toReference } from '@/lib/server/playground/db';
import type { ReferenceRole } from '@/lib/playground/models';

type Context = { params: Promise<{ projectId: string }> };

const MAX_REFERENCES_PER_PROJECT = 40;
const ROLES: ReferenceRole[] = ['product', 'person', 'style'];

/**
 * Adds reference images to the project: files the browser uploaded to our storage
 * ({ images: [{ url, role, label, width, height, mimeType }] }), or one of the project's
 * generated images ({ sourceItemId, role }).
 */
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const projectId = requireUuid((await params).projectId, 'project');
    const body = await readJson<{
      images?: Array<{ url?: unknown; role?: unknown; label?: unknown; width?: unknown; height?: unknown; mimeType?: unknown }>;
      sourceItemId?: unknown;
      role?: unknown;
    }>(request);
    const db = playgroundDb();
    await getOwnedProject(db, projectId, user.id);

    const existing = await db
      .from('playground_references')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId);
    assertDb(existing.error, 'count the references');
    const count = existing.count ?? 0;

    const role = (value: unknown): ReferenceRole => (ROLES.includes(value as ReferenceRole) ? (value as ReferenceRole) : 'product');
    const size = (value: unknown) => (typeof value === 'number' && value > 0 ? Math.round(value) : null);
    let rows: Array<Record<string, unknown>> = [];

    if (isUuid(body.sourceItemId)) {
      const item = await getOwnedItem(db, body.sourceItemId, user.id, 'id, project_id, status, image_url, width, height, mime_type');
      if (item.project_id !== projectId || item.status !== 'done' || typeof item.image_url !== 'string') {
        throw new ApiError(400, 'Only finished images from this project can become references.', 'bad_request');
      }
      rows = [{
        url: item.image_url,
        role: role(body.role),
        label: 'From a generated image',
        width: item.width,
        height: item.height,
        mime_type: item.mime_type,
        source_item_id: item.id,
      }];
    } else {
      const images = Array.isArray(body.images) ? body.images : [];
      if (!images.length) throw new ApiError(400, 'No images to add.', 'bad_request');
      rows = images.map((image) => {
        if (typeof image.url !== 'string' || !isOwnStorageUrl(image.url)) {
          throw new ApiError(400, 'Reference images must be uploaded first.', 'bad_request');
        }
        return {
          url: image.url,
          role: role(image.role),
          label: typeof image.label === 'string' ? image.label.trim().slice(0, 80) : '',
          width: size(image.width),
          height: size(image.height),
          mime_type: typeof image.mimeType === 'string' ? image.mimeType : null,
        };
      });
    }

    if (count + rows.length > MAX_REFERENCES_PER_PROJECT) {
      throw new ApiError(400, `A project can keep up to ${MAX_REFERENCES_PER_PROJECT} reference images.`, 'too_many');
    }

    const { data, error } = await db
      .from('playground_references')
      .insert(rows.map((row, index) => ({ ...row, project_id: projectId, user_id: user.id, sort_order: count + index })))
      .select('*');
    assertDb(error, 'add the references');
    await db.from('playground_projects').update({ updated_at: new Date().toISOString() }).eq('id', projectId);
    return NextResponse.json({ references: ((data ?? []) as Array<Record<string, unknown>>).map(toReference) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not add the references');
  }
}
