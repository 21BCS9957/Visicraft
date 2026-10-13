import { NextRequest, NextResponse } from 'next/server';
import { listTeamMembers, loadFeed, requireDashboardOwner, requireTeamMember } from '@/lib/server/dashboard';
import { apiErrorResponse } from '@/lib/server/playground/http';
import type { FeedStatus, FeedType } from '@/lib/dashboard/types';

/**
 * What the team (or ?account=, or ?project=) made, images and videos newest first. ?type=,
 * ?status= (done by default, live, failed), ?before=. Read-only.
 */
export async function GET(request: NextRequest) {
  try {
    await requireDashboardOwner(request);
    const params = request.nextUrl.searchParams;
    const account = params.get('account');
    const userIds = account ? [(await requireTeamMember(account)).id] : (await listTeamMembers()).map((member) => member.id);
    const type = (['image', 'video'].includes(params.get('type') ?? '') ? params.get('type') : 'all') as FeedType;
    const status = (['live', 'failed'].includes(params.get('status') ?? '') ? params.get('status') : 'done') as FeedStatus;
    const project = params.get('project');
    const before = params.get('before');
    const limit = Number(params.get('limit'));
    if (!userIds.length) return NextResponse.json({ items: [], nextBefore: null });
    return NextResponse.json(await loadFeed(userIds, {
      type,
      status,
      project: project && /^[0-9a-f-]{36}$/i.test(project) ? project : null,
      // The cursor from the last page ("time~source~id"); loadFeed checks it.
      before: before && before.length <= 120 ? before : null,
      limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 60) : undefined,
    }));
  } catch (error) {
    return apiErrorResponse(error, 'Could not load the generations');
  }
}
