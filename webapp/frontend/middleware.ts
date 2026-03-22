import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Subdomain routing for public-facing summer pages.
 * - summer.* → /summer/apply (application form)
 * - prospect.* → /summer/prospect (P6 prospect registration)
 */
export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const { pathname } = request.nextUrl;

  const allowInternals =
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logo");

  // Summer subdomain → application form
  if (hostname.startsWith("summer.")) {
    if (pathname.startsWith("/summer") || allowInternals) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/summer/apply";
    return NextResponse.redirect(url);
  }

  // Prospect subdomain → P6 prospect page
  if (hostname.startsWith("prospect.")) {
    if (pathname.startsWith("/summer/prospect") || allowInternals) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/summer/prospect";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on all paths except static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
