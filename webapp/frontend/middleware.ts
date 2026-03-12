import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * On the summer subdomain (summer.*), restrict access to /summer/* and /api/* only.
 * Any other path redirects to /summer/apply so applicants never see the internal app.
 */
export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const isSummerDomain = hostname.startsWith("summer.");

  if (!isSummerDomain) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // Allow summer pages, API calls, and Next.js internals
  if (
    pathname.startsWith("/summer") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Redirect everything else to the application form
  const url = request.nextUrl.clone();
  url.pathname = "/summer/apply";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on all paths except static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
