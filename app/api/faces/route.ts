import { NextRequest, NextResponse } from 'next/server';
import { ApiError, readJson, withUser } from '@/lib/server/playground/http';
import { listFaces, startFace } from '@/lib/server/videoFaces';
import { facesErrorResponse, scanCallbackUrl } from '@/lib/server/facesHttp';

/** The signed-in user's verified faces (each checked with BytePlus), and what setup is missing. */
export async function GET(request: NextRequest) {
  try {
    const user = await withUser(request);
    return NextResponse.json(await listFaces(user.id));
  } catch (error) {
    return facesErrorResponse(error, 'Could not load your faces');
  }
}

/** A new face: needs the person's name and the uploader's confirmation that the person agreed. Returns the scan link. */
export async function POST(request: NextRequest) {
  try {
    const user = await withUser(request);
    const body = await readJson<{ name?: unknown; consent?: unknown }>(request);
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
    if (!name) throw new ApiError(400, 'Enter the person’s name.', 'bad_request');
    if (body.consent !== true) throw new ApiError(400, 'Confirm that this person agrees to appear in AI videos and will scan their own face.', 'consent');
    return NextResponse.json({ face: await startFace(user.id, name, scanCallbackUrl(request)) });
  } catch (error) {
    return facesErrorResponse(error, 'Could not start the face scan');
  }
}
