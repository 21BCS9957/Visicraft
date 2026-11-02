import { NextRequest, NextResponse } from 'next/server';
import { chatDb, loadSidebar } from '@/lib/server/chat/db';
import { apiErrorResponse, withUser } from '@/lib/server/playground/http';

/** The signed-in account's Chat projects and newest chats (`setup` until the migration has run). */
export async function GET(request: NextRequest) {
  try {
    const user = await withUser(request);
    return NextResponse.json(await loadSidebar(chatDb(), user.id));
  } catch (error) {
    return apiErrorResponse(error, 'Could not load your chats');
  }
}
