import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requireTeamMember } from '@/lib/server/admin';
import { apiErrorResponse } from '@/lib/server/playground/http';
import { libraryKind, listLibrary, playgroundDb } from '@/lib/server/playground/db';

/** A team member's Library (?kind=image|video|document, ?q=, ?before=). Read-only. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await requireAdmin(request);
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
