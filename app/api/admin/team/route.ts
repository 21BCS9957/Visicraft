import { NextRequest, NextResponse } from 'next/server';
import { listTeamMembers, memberSummary, requireAdmin, teamDomain } from '@/lib/server/admin';
import { apiErrorResponse } from '@/lib/server/playground/http';
import type { TeamOverview } from '@/lib/admin/types';

/** The team accounts the admin can view, each with what they have made. Read-only. */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const members = await listTeamMembers();
    const summaries = await Promise.all(members.map((member) => memberSummary(member.id)));
    const body: TeamOverview = { domain: teamDomain(), members: members.map((member, i) => ({ ...member, summary: summaries[i] })) };
    return NextResponse.json(body);
  } catch (error) {
    return apiErrorResponse(error, 'Could not load the team');
  }
}
