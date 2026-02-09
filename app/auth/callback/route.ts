import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/';

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (error) {
        console.error('Auth callback error:', error);
        return NextResponse.redirect(new URL('/login?error=auth_failed', requestUrl.origin));
      }
      
      console.log('✅ Auth successful, redirecting to:', next);
    } catch (error) {
      console.error('Auth callback exception:', error);
      return NextResponse.redirect(new URL('/login?error=auth_exception', requestUrl.origin));
    }
  }

  // Redirect to the next URL or home page
  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
