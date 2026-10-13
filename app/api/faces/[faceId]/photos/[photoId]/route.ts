import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/lib/server/playground/http';
import { deletePhoto } from '@/lib/server/videoFaces';
import { facesErrorResponse } from '@/lib/server/facesHttp';

/** Removes one photo of a face (also from BytePlus). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ faceId: string; photoId: string }> }) {
  try {
    const user = await withUser(request);
    const { faceId, photoId } = await params;
    return NextResponse.json({ face: await deletePhoto(user.id, faceId, photoId) });
  } catch (error) {
    return facesErrorResponse(error, 'Could not remove this photo');
  }
}
