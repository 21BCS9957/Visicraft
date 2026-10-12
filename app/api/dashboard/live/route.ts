import { NextRequest, NextResponse } from 'next/server';
import { listTeamMembers, loadLive, requireDashboardOwner, requireTeamMember } from '@/lib/server/dashboard';
import { apiErrorResponse } from '@/lib/server/playground/http';

/** What the team (or ?account=) is generating right now; the dashboard asks every few seconds. Read-only. */
export async function GET(request: NextRequest) {
  try {
    await requireDashboardOwner(request);
    const account = request.nextUrl.searchParams.get('account');
    const userIds = account ? [(await requireTeamMember(account)).id] : (await listTeamMembers()).map((member) => member.id);
    if (!userIds.length) return NextResponse.json({ items: [], checkedAt: new Date().toISOString() });
    return NextResponse.json(await loadLive(userIds));
  } catch (error) {
    return apiErrorResponse(error, 'Could not load what is generating');
  }
}
