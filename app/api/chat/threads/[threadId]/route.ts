import { NextRequest, NextResponse } from 'next/server';
import { chatDb, deleteThread, loadMessages, requireProject, requireThread, updateThread } from '@/lib/server/chat/db';
import { ApiError, apiErrorResponse, readJson, withUser } from '@/lib/server/playground/http';

type Context = { params: Promise<{ threadId: string }> };

/** A chat and its messages. */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const db = chatDb();
    const thread = await requireThread(db, user.id, (await params).threadId);
    const shown = { id: thread.id, projectId: thread.projectId, title: thread.title, createdAt: thread.createdAt, updatedAt: thread.updatedAt };
    return NextResponse.json({ thread: shown, messages: await loadMessages(db, thread.id), settings: thread.settings });
  } catch (error) {
    return apiErrorResponse(error, 'Could not load the chat');
  }
}

/** Renames the chat or moves it into a project (or out: `projectId: null`). Its place in the list stays. */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const db = chatDb();
    const thread = await requireThread(db, user.id, (await params).threadId);
    const body = await readJson<{ title?: unknown; projectId?: unknown }>(request);
    const patch: Record<string, unknown> = {};
    if (typeof body.title === 'string') {
      const title = body.title.replace(/\s+/g, ' ').trim().slice(0, 120);
      if (!title) throw new ApiError(400, 'The chat needs a name.', 'bad_request');
      patch.title = title;
    }
    if (body.projectId === null) patch.project_id = null;
    else if (typeof body.projectId === 'string') patch.project_id = (await requireProject(db, user.id, body.projectId)).id;
    if (!Object.keys(patch).length) throw new ApiError(400, 'Nothing to change.', 'bad_request');
    return NextResponse.json({ thread: await updateThread(db, user.id, thread.id, patch) });
  } catch (error) {
    return apiErrorResponse(error, 'Could not save the chat');
  }
}

/** Deletes the chat and its messages. */
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const db = chatDb();
    const thread = await requireThread(db, user.id, (await params).threadId);
    await deleteThread(db, user.id, thread.id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiErrorResponse(error, 'Could not delete the chat');
  }
}
