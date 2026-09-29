import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, readJson, withUser } from '@/lib/server/playground/http';
import { PLAYGROUND_BUCKET } from '@/lib/server/playground/images';
import { createSignedUploadTarget } from '@/lib/server/supabaseStorage';

const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 40 * 1024 * 1024;

/** A one-time upload slot for a full-resolution Canvas export (signed-in users only). */
export async function POST(request: NextRequest) {
  try {
    await withUser(request);
    const body = await readJson<{ contentType?: unknown; size?: unknown }>(request);
    const contentType = typeof body.contentType === 'string' ? body.contentType : '';
    const size = typeof body.size === 'number' ? body.size : 0;
    if (!TYPES.has(contentType)) throw new ApiError(400, 'Only PNG, JPEG or WebP images can be saved.', 'bad_request');
    if (size <= 0 || size > MAX_BYTES) throw new ApiError(400, 'The image is larger than 40 MB.', 'too_large');
    return NextResponse.json({ bucket: PLAYGROUND_BUCKET, ...(await createSignedUploadTarget(PLAYGROUND_BUCKET, contentType)) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not prepare the upload');
  }
}
