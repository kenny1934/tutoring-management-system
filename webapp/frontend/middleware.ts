import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Subdomain routing for public-facing summer pages.
 * - summer.* → /summer/landing (marketing front door)
 *   ├─ /apply → /summer/apply (application form)
 *   └─ /status → /summer/status (status check)
 * - prospect.* → /summer/prospect (P6 prospect registration)
 * - buddy.* → /summer/buddy (buddy tracker for primary branches)
 */
export function middleware(request: NextRequest) {
  const hostname = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const { pathname } = request.nextUrl;

  const allowInternals =
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logo") ||
    /\.(png|ico|jpg|svg|webp)$/i.test(pathname);

  // Summer subdomain → marketing landing at the root, clean URLs for the
  // form (/apply) and status check (/status) backed by /summer/* files.
  // Legacy /summer/apply links (printed pamphlet QR codes) bounce to the
  // landing page so parents see the marketing pitch first.
  if (hostname.startsWith("summer.")) {
    if (allowInternals) return NextResponse.next();
    const url = request.nextUrl.clone();

    // Legacy path redirects. The QR codes on the printed pamphlets encode
    // /summer/apply, but we now want parents to land on the marketing page
    // first — they can tap the CTA to reach the form.
    if (
      pathname === "/summer" ||
      pathname === "/summer/" ||
      pathname === "/summer/apply" ||
      pathname === "/summer/landing"
    ) {
      url.pathname = "/";
      return NextResponse.redirect(url, 308);
    }
    if (pathname === "/summer/status") {
      url.pathname = "/status";
      return NextResponse.redirect(url, 308);
    }

    // Root → landing page (rewrite, not redirect, so the address bar stays
    // bare on the canonical URL).
    if (pathname === "/") {
      url.pathname = "/summer/landing";
      return NextResponse.rewrite(url);
    }

    // Clean URLs → rewrite to the actual /summer/* files. Browser keeps the
    // clean URL; LayoutShell + SummerLayoutInner trigger off /summer/* paths.
    if (pathname === "/apply" || pathname.startsWith("/apply/")) {
      url.pathname = "/summer/apply" + pathname.slice("/apply".length);
      return NextResponse.rewrite(url);
    }
    if (pathname === "/status" || pathname.startsWith("/status/")) {
      url.pathname = "/summer/status" + pathname.slice("/status".length);
      return NextResponse.rewrite(url);
    }

    // Anything else under /summer/* (e.g. nested assets) passes through.
    if (pathname.startsWith("/summer/")) return NextResponse.next();

    // Unknown path on summer.* → bounce to landing.
    url.pathname = "/";
    return NextResponse.redirect(url, 308);
  }

  // Prospect subdomain → P6 prospect page (rewrite all paths to keep clean URLs)
  if (hostname.startsWith("prospect.")) {
    if (allowInternals) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/summer/prospect";
    return NextResponse.rewrite(url);
  }

  // Buddy subdomain → buddy tracker (rewrite for clean URLs)
  if (hostname.startsWith("buddy.")) {
    if (allowInternals) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/summer/buddy";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on all paths except static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
