import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardOwner, requireTeamMember } from '@/lib/server/dashboard';
import { apiErrorResponse, requireUuid } from '@/lib/server/playground/http';
import { loadProjectBundle, playgroundDb } from '@/lib/server/playground/db';

/**
 * One of a team account's image projects with its runs and images (?before= for older runs).
 * Read-only: the stale-image sweep an account's own visit runs is skipped, so nothing changes.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string; projectId: string }> }) {
  try {
    await requireDashboardOwner(request);
    const { userId, projectId } = await params;
    const member = await requireTeamMember(userId);
    const bundle = await loadProjectBundle(playgroundDb(), member.id, requireUuid(projectId, 'project'), request.nextUrl.searchParams.get('before'), { readOnly: true });
    return NextResponse.json({ member, ...bundle });
  } catch (error) {
    return apiErrorResponse(error, 'Could not load the project');
  }
}
