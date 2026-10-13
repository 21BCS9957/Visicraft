import { NextRequest, NextResponse } from 'next/server';
import { readJson, withUser } from '@/lib/server/playground/http';
import { deleteFace, getFace, rescanFace } from '@/lib/server/videoFaces';
import { facesErrorResponse, scanCallbackUrl } from '@/lib/server/facesHttp';

type Context = { params: Promise<{ faceId: string }> };

/** One face, with BytePlus asked how its scan and photos are going (the Studio asks every few seconds while waiting). */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const { faceId } = await params;
    return NextResponse.json({ face: await getFace(user.id, faceId) });
  } catch (error) {
    return facesErrorResponse(error, 'Could not load this face');
  }
}

/** { action: 'rescan' }: a fresh scan link, for a link that expired or a scan that failed. */
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const { faceId } = await params;
    const body = await readJson<{ action?: unknown }>(request);
    if (body.action !== 'rescan') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    return NextResponse.json({ face: await rescanFace(user.id, faceId, scanCallbackUrl(request)) });
  } catch (error) {
    return facesErrorResponse(error, 'Could not make a new scan link');
  }
}

/** Removes the face and its photos (also from BytePlus). */
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const { faceId } = await params;
    await deleteFace(user.id, faceId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return facesErrorResponse(error, 'Could not remove this face');
  }
}
