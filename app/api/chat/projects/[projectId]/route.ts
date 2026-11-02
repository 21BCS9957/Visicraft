import { NextRequest, NextResponse } from 'next/server';
import { chatDb, deleteProject, requireProject, updateProject } from '@/lib/server/chat/db';
import { ApiError, apiErrorResponse, readJson, withUser } from '@/lib/server/playground/http';

type Context = { params: Promise<{ projectId: string }> };

/** A project's name and instructions. */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    return NextResponse.json({ project: await requireProject(chatDb(), user.id, (await params).projectId) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not load the project');
  }
}

/** Renames the project or saves its instructions (sent with every chat in it). */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const db = chatDb();
    const project = await requireProject(db, user.id, (await params).projectId);
    const body = await readJson<{ name?: unknown; instructions?: unknown }>(request);
    const patch: { name?: string; instructions?: string } = {};
    if (typeof body.name === 'string') {
      const name = body.name.replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!name) throw new ApiError(400, 'The project needs a name.', 'bad_request');
      patch.name = name;
    }
    if (typeof body.instructions === 'string') patch.instructions = body.instructions.slice(0, 8000);
    return NextResponse.json({ project: await updateProject(db, user.id, project.id, patch) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not save the project');
  }
}

/** Deletes the project and its chats (images already made stay in storage and the Library). */
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const db = chatDb();
    const project = await requireProject(db, user.id, (await params).projectId);
    await deleteProject(db, user.id, project.id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiErrorResponse(error, 'Could not delete the project');
  }
}
