import { NextRequest, NextResponse } from 'next/server';
import { chatDb, createProject } from '@/lib/server/chat/db';
import { ApiError, apiErrorResponse, readJson, withUser } from '@/lib/server/playground/http';

/** A new Chat project. */
export async function POST(request: NextRequest) {
  try {
    const user = await withUser(request);
    const body = await readJson<{ name?: unknown }>(request);
    const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    if (!name) throw new ApiError(400, 'Give the project a name.', 'bad_request');
    return NextResponse.json({ project: await createProject(chatDb(), user.id, name) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not create the project');
  }
}
