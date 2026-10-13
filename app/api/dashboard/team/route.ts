import { NextRequest, NextResponse } from 'next/server';
import { listTeamMembers, requireDashboardOwner } from '@/lib/server/dashboard';
import { apiErrorResponse } from '@/lib/server/playground/http';

/** The team accounts, for the dashboard's sidebar. Read-only. */
export async function GET(request: NextRequest) {
  try {
    await requireDashboardOwner(request);
    return NextResponse.json({ members: await listTeamMembers() });
  } catch (error) {
    return apiErrorResponse(error, 'Could not load the team');
  }
}
