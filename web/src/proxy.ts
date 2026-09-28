import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, isValidAdminSessionToken } from "@/lib/admin-auth";

/** Paths under /admin that don't require a session — the login form itself and its submit action. */
const PUBLIC_ADMIN_PATHS = ["/admin/login"];

/**
 * Static PO-converter tools (public/tools/**) used to be open to any staff
 * member with no login, per the original request. Now gated the same as
 * /admin — staff must log in with the admin password before opening them.
 */
function requiresSession(pathname: string): boolean {
  if (pathname.startsWith("/admin")) return !PUBLIC_ADMIN_PATHS.some((path) => pathname === path);
  if (pathname.startsWith("/tools")) return true;
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!requiresSession(pathname)) return NextResponse.next();

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (isValidAdminSessionToken(token)) return NextResponse.next();

  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/tools/:path*"],
};
