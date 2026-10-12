import { NextResponse, type NextRequest } from 'next/server';

/**
 * dashboard.<domain> serves the GoGrowth dashboard (app/dashboard) at its root:
 * dashboard.<domain>/ is /dashboard and /accounts/<id> is /dashboard/accounts/<id>. On the main
 * site, /dashboard (and the old /admin/team pages) redirect there.
 */
const PREFIX = 'dashboard.';

export function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  if (host.startsWith(PREFIX)) {
    if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return NextResponse.next();
    const target = request.nextUrl.clone();
    target.pathname = `/dashboard${pathname === '/' ? '' : pathname}`;
    return NextResponse.rewrite(target);
  }

  const dashboardPath = pathname === '/dashboard' || pathname.startsWith('/dashboard/')
    ? pathname.replace(/^\/dashboard/, '') || '/'
    : pathname === '/admin/team' || pathname.startsWith('/admin/team/')
      ? pathname.replace(/^\/admin\/team\/?/, '/').replace(/^\/([0-9a-f-]{36})/i, '/accounts/$1')
      : null;
  if (dashboardPath !== null) {
    const target = new URL(request.url);
    target.host = `${PREFIX}${host.replace(/^www\./, '')}`;
    target.pathname = dashboardPath;
    return NextResponse.redirect(target);
  }
  return NextResponse.next();
}

export const config = {
  // Pages only: API routes, the sign-in callback, Next's own files and anything with a file
  // extension (images, videos, icons) pass straight through.
  matcher: ['/((?!api/|auth/|_next/|.*\\.[a-zA-Z0-9]+$).*)'],
};
