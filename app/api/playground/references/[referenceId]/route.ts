import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, assertDb, readJson, requireUuid, withUser } from '@/lib/server/playground/http';
import { playgroundDb, toReference } from '@/lib/server/playground/db';
import type { ReferenceRole } from '@/lib/playground/models';

type Context = { params: Promise<{ referenceId: string }> };

const ROLES: ReferenceRole[] = ['product', 'person', 'style'];

/** Changes a reference's role or label, or switches it on or off. */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const referenceId = requireUuid((await params).referenceId, 'reference');
    const body = await readJson<{ role?: unknown; label?: unknown; enabled?: unknown }>(request);
    const update: Record<string, unknown> = {};
    if (ROLES.includes(body.role as ReferenceRole)) update.role = body.role;
    if (typeof body.label === 'string') update.label = body.label.trim().slice(0, 80);
    if (typeof body.enabled === 'boolean') update.enabled = body.enabled;
    if (!Object.keys(update).length) throw new ApiError(400, 'Nothing to change.', 'bad_request');

    const { data, error } = await playgroundDb()
      .from('playground_references')
      .update(update)
      .eq('id', referenceId)
      .eq('user_id', user.id)
      .select('*')
      .maybeSingle();
    assertDb(error, 'update the reference');
    if (!data) throw new ApiError(404, 'Reference not found.', 'not_found');
    return NextResponse.json({ reference: toReference(data as Record<string, unknown>) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not update the reference');
  }
}

/** Removes a reference from the project. Its file stays: earlier runs still show it. */
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const referenceId = requireUuid((await params).referenceId, 'reference');
    const { data, error } = await playgroundDb()
      .from('playground_references')
      .delete()
      .eq('id', referenceId)
      .eq('user_id', user.id)
      .select('id');
    assertDb(error, 'remove the reference');
    if (!data?.length) throw new ApiError(404, 'Reference not found.', 'not_found');
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiErrorResponse(error, 'Could not remove the reference');
  }
}
