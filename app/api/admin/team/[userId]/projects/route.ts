import { NextRequest, NextResponse } from 'next/server';
import { memberSummary, requireAdmin, requireTeamMember } from '@/lib/server/admin';
import { apiErrorResponse } from '@/lib/server/playground/http';
import { listProjects, playgroundDb } from '@/lib/server/playground/db';

/** A team member's image projects (or ?kind=video), with who they are. Read-only. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await requireAdmin(request);
    const { userId } = await params;
    const member = await requireTeamMember(userId);
    const kind = request.nextUrl.searchParams.get('kind') === 'video' ? 'video' : 'image';
    const [list, summary] = await Promise.all([listProjects(playgroundDb(), member.id, kind), memberSummary(member.id)]);
    return NextResponse.json({ member: { ...member, summary }, ...list });
  } catch (error) {
    return apiErrorResponse(error, 'Could not load the projects');
  }
}
