import { NextRequest, NextResponse } from 'next/server';
import { loadFeed } from '@/lib/server/dashboard';
import { apiErrorResponse, requireUuid, withUser } from '@/lib/server/playground/http';
import type { FeedType } from '@/lib/dashboard/types';

/**
 * The signed-in person's finished creatives, newest first: Playground images and Video Studio
 * videos, all projects or one (?project=), ?type= all · image · video, ?before= for the next
 * page. Only their own work; images from the retired Generate page are left out.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await withUser(request);
    const params = request.nextUrl.searchParams;
    const project = params.get('project');
    const type = (['image', 'video'].includes(params.get('type') ?? '') ? params.get('type') : 'all') as FeedType;
    const before = params.get('before');
    if (before && before.length > 120) return NextResponse.json({ error: 'Bad cursor.' }, { status: 400 });
    const page = await loadFeed([user.id], {
      type,
      status: 'done',
      project: project ? requireUuid(project, 'project') : null,
      before,
      limit: 48,
    });
    return NextResponse.json({ ...page, items: page.items.filter((item) => item.kind !== 'image' || item.source !== 'quick') });
  } catch (error) {
    return apiErrorResponse(error, 'Could not load your creatives');
  }
}
