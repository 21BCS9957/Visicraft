import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Back to a path on the site the browser came from. The Location is relative because the
 * request's own URL names the dev server's host (localhost:3000) even on dashboard.localhost,
 * and the browser resolves a relative one against the address it actually used. The sign-in
 * token rides in the URL's #fragment, which the browser carries over to it.
 */
function redirectTo(path: string) {
  return new Response(null, { status: 307, headers: { Location: path } });
}

/** Only a path on this site: "//other.site", "/\other.site" or "https://…" would hand the sign-in to another site. */
function safeNext(value: string | null): string {
  return value && /^\/(?![\\/])/.test(value) ? value : '/';
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = safeNext(requestUrl.searchParams.get('next'));

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error('Auth callback error:', error);
        return redirectTo('/login?error=auth_failed');
      }

      console.log('✅ Auth successful, redirecting to:', next);
    } catch (error) {
      console.error('Auth callback exception:', error);
      return redirectTo('/login?error=auth_exception');
    }
  }

  // Redirect to the next URL or home page
  return redirectTo(next);
}
