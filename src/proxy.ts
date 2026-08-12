import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route protection (task 14; FR-001 AC-5; AR-2).
 *
 * In Next.js 16 this file convention is `proxy`, the renamed `middleware` — see
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`. Documented in
 * decisions as D-17, since `tasks.md` still names `src/middleware.ts`.
 *
 * **What this layer decides and what it deliberately does not.** The proxy runs before rendering and
 * is explicitly not supposed to share modules with the application, so it does exactly one cheap
 * thing: it looks for a session cookie. No cookie means the request is certainly unauthenticated, and
 * it is turned away here — before any handler can touch the database, and without revealing whether
 * the requested resource exists.
 *
 * A cookie present means *maybe*: the row behind it may have been deleted by a sign-out (FR-001
 * AC-6). Confirming that needs the database, so it is the layout's and each handler's job — they call
 * `auth()` and derive an `OwnerScope`. Ownership is likewise never decided here: a foreign project
 * answers `NOT_FOUND` from the query itself (AR-2), which a cookie check cannot express.
 */

/**
 * Auth.js names the session cookie `__Secure-authjs.session-token` when the resolved URL is https and
 * `authjs.session-token` otherwise. Both are accepted so one build works on localhost and on a
 * deployment; the name is derived by the library, so it is listed rather than recomputed here.
 */
const SESSION_COOKIE_NAMES = ['authjs.session-token', '__Secure-authjs.session-token'] as const;

/** Reachable without a session: marketing, the sign-in screen, and the OAuth endpoints themselves. */
const PUBLIC_PATHS = new Set(['/', '/signin']);

const AUTH_ROUTE_PREFIX = '/api/auth';

export function isPublicPath(pathname: string): boolean {
  // The trailing slash matters: a prefix test alone would also open a future `/api/authorisation`
  // route to anonymous traffic, which is how an exemption quietly becomes a hole.
  const isAuthRoute =
    pathname === AUTH_ROUTE_PREFIX || pathname.startsWith(`${AUTH_ROUTE_PREFIX}/`);

  return PUBLIC_PATHS.has(pathname) || isAuthRoute;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
  if (hasSessionCookie) return NextResponse.next();

  // An API client gets a machine-readable code from the solution's error table, not an HTML redirect.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } },
      { status: 401 },
    );
  }

  return NextResponse.redirect(new URL('/signin', request.nextUrl.origin));
}

/**
 * Everything except Next's own static output. The proxy runs on application and API routes alike;
 * without the exclusions it would also gate CSS, JS and images, which would break the sign-in page
 * it redirects to.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
