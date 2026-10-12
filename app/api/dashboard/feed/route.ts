import { NextRequest, NextResponse } from 'next/server';
import { listTeamMembers, loadFeed, requireDashboardOwner, requireTeamMember } from '@/lib/server/dashboard';
import { apiErrorResponse } from '@/lib/server/playground/http';
import type { FeedStatus, FeedType } from '@/lib/dashboard/types';

/** Everything the team (or ?account=) made, images and videos newest first. ?type=, ?status=, ?before=. Read-only. */
export async function GET(request: NextRequest) {
  try {
    await requireDashboardOwner(request);
    const params = request.nextUrl.searchParams;
    const account = params.get('account');
    const userIds = account ? [(await requireTeamMember(account)).id] : (await listTeamMembers()).map((member) => member.id);
    const type = (['image', 'video'].includes(params.get('type') ?? '') ? params.get('type') : 'all') as FeedType;
    const status = (['done', 'failed', 'live'].includes(params.get('status') ?? '') ? params.get('status') : 'all') as FeedStatus;
    const before = params.get('before');
    if (!userIds.length) return NextResponse.json({ items: [], nextBefore: null });
    return NextResponse.json(await loadFeed(userIds, { type, status, before: before && !Number.isNaN(Date.parse(before)) ? before : null }));
  } catch (error) {
    return apiErrorResponse(error, 'Could not load the generations');
  }
}
