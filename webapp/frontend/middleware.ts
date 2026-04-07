import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Subdomain routing for public-facing summer pages.
 * - summer.* → /summer/apply (application form)
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

  // Summer subdomain → clean URLs (/apply, /status) backed by /summer/* files.
  // Old /summer/apply and /summer/status links (e.g. printed pamphlet QR codes)
  // get redirected to the clean form so the address bar matches the marketing.
  if (hostname.startsWith("summer.")) {
    if (allowInternals) return NextResponse.next();
    const url = request.nextUrl.clone();

    // Legacy path redirects — clean up the address bar for old links.
    if (pathname === "/summer" || pathname === "/summer/" || pathname === "/summer/apply") {
      url.pathname = "/apply";
      return NextResponse.redirect(url, 308);
    }
    if (pathname === "/summer/status") {
      url.pathname = "/status";
      return NextResponse.redirect(url, 308);
    }

    // Root → apply (clean URL).
    if (pathname === "/") {
      url.pathname = "/apply";
      return NextResponse.redirect(url, 308);
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

    // Unknown path on summer.* → bounce to apply.
    url.pathname = "/apply";
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
