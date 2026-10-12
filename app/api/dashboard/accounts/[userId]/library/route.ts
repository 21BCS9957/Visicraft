import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardOwner, requireTeamMember } from '@/lib/server/dashboard';
import { apiErrorResponse } from '@/lib/server/playground/http';
import { libraryKind, listLibrary, playgroundDb } from '@/lib/server/playground/db';

/** A team account's Library (?kind=image|video|document, ?q=, ?before=). Read-only. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await requireDashboardOwner(request);
    const { userId } = await params;
    const member = await requireTeamMember(userId);
    const search = request.nextUrl.searchParams;
    return NextResponse.json(await listLibrary(playgroundDb(), member.id, {
      kind: libraryKind(search.get('kind')),
      before: search.get('before'),
      q: search.get('q'),
    }));
  } catch (error) {
    return apiErrorResponse(error, 'Could not load the library');
  }
}
