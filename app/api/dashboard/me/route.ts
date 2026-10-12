import { NextRequest, NextResponse } from 'next/server';
import { isOwnerEmail } from '@/lib/server/dashboard';
import { withUser } from '@/lib/server/playground/http';

/** Whether the signed-in account may open the dashboard (every data route checks again). */
export async function GET(request: NextRequest) {
  try {
    const user = await withUser(request);
    return NextResponse.json({ allowed: isOwnerEmail(user.email), email: user.email ?? null });
  } catch {
    return NextResponse.json({ allowed: false, email: null });
  }
}
