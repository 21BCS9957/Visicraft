import { NextRequest, NextResponse } from 'next/server';
import { ApiError, readJson, withUser } from '@/lib/server/playground/http';
import { isOwnStorageUrl } from '@/lib/server/playground/db';
import { addPhoto } from '@/lib/server/videoFaces';
import { facesErrorResponse } from '@/lib/server/facesHttp';

/** Adds a photo of the verified person, uploaded to our storage first; BytePlus checks it is the same person. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ faceId: string }> }) {
  try {
    const user = await withUser(request);
    const { faceId } = await params;
    const body = await readJson<{ url?: unknown }>(request);
    const url = typeof body.url === 'string' ? body.url : '';
    if (!isOwnStorageUrl(url)) throw new ApiError(400, 'Upload the photo first.', 'bad_request');
    return NextResponse.json({ face: await addPhoto(user.id, faceId, url) });
  } catch (error) {
    return facesErrorResponse(error, 'Could not add this photo');
  }
}
