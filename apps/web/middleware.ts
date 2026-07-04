import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Defense-in-depth auth backstop.
 *
 * Until now the only access control was each page/action calling requireSite()
 * individually — so a single forgotten guard exposed a tenant route. This
 * middleware requires the opaque session-token cookie on every admin page and
 * bounces anonymous requests to /login. It is a BACKSTOP, not the real gate:
 * the cookie's validity (and tenant ownership) is still verified server-side in
 * requireSite()/requireUser() and the per-action ownership checks — the Edge
 * runtime can't reach the DB, so we only check for the cookie's presence here.
 *
 * Deliberately NOT gated:
 *   - /api/*  — those routes self-authenticate (cron via token, draft/post
 *               images serve by id and are embedded in the public blog, upload
 *               checks the session). Gating them by cookie would break public
 *               blog images; see the matcher below.
 *   - /login, /activate, /onboarding — the pre-session entry flow.
 *   - /blog/* — the public, unauthenticated blog.
 *   - /      — self-redirects to /dashboard or /login based on session.
 *   - Next internals + static assets (excluded by the matcher).
 */

const SESSION_COOKIE = "artifation_session";

const PUBLIC_PREFIXES = ["/login", "/activate", "/onboarding", "/blog"];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything EXCEPT /api, Next internals, and static asset files.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpe?g|gif|svg|ico|webp|avif|css|js|map|woff2?|ttf)).*)",
  ],
};
