import { NextRequest, NextResponse } from 'next/server';
import { isAdminEmail } from '@/lib/server/admin';
import { withUser } from '@/lib/server/playground/http';

/** Whether the signed-in account is the GoGrowth admin (only decides whether the menu shows Team workspaces). */
export async function GET(request: NextRequest) {
  try {
    const user = await withUser(request);
    return NextResponse.json({ admin: isAdminEmail(user.email) });
  } catch {
    return NextResponse.json({ admin: false });
  }
}
