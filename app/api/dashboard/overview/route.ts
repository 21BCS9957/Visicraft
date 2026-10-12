import { NextRequest, NextResponse } from 'next/server';
import { loadOverview, requireDashboardOwner } from '@/lib/server/dashboard';
import { apiErrorResponse } from '@/lib/server/playground/http';

/** The team accounts with what each has made and how much is generating now. Read-only. */
export async function GET(request: NextRequest) {
  try {
    await requireDashboardOwner(request);
    return NextResponse.json(await loadOverview());
  } catch (error) {
    return apiErrorResponse(error, 'Could not load the dashboard');
  }
}
