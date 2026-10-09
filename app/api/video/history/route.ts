import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { apiErrorResponse, withUser } from '@/lib/server/playground/http';
import { loadVideoHistory } from '@/lib/server/videoHistory';

/** The signed-in user's videos, newest first (lib/server/videoHistory.ts). */
export async function GET(request: NextRequest) {
  try {
    const user = await withUser(request);
    const page = await loadVideoHistory(createServiceClient(), user.id, {
      projectId: request.nextUrl.searchParams.get('projectId'),
      before: request.nextUrl.searchParams.get('before'),
    });
    return NextResponse.json(page);
  } catch (error) {
    return apiErrorResponse(error, 'Could not load your videos');
  }
}
