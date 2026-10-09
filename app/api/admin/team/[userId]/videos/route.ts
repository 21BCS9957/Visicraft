import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, requireTeamMember } from '@/lib/server/admin';
import { apiErrorResponse } from '@/lib/server/playground/http';
import { loadVideoHistory } from '@/lib/server/videoHistory';

/** A team member's videos (?projectId= for one project, ?before= for more). Read-only. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await requireAdmin(request);
    const { userId } = await params;
    const member = await requireTeamMember(userId);
    const page = await loadVideoHistory(createServiceClient(), member.id, {
      projectId: request.nextUrl.searchParams.get('projectId'),
      before: request.nextUrl.searchParams.get('before'),
    });
    return NextResponse.json(page);
  } catch (error) {
    return apiErrorResponse(error, 'Could not load the videos');
  }
}
