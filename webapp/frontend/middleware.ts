import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Subdomain routing for public-facing summer pages and companion games.
 * - summer.* → /summer/landing (marketing front door)
 *   ├─ /apply → /summer/apply (application form)
 *   └─ /status → /summer/status (status check)
 * - prospect.* → /summer/prospect (P6 prospect registration)
 * - buddy.* → /summer/buddy (buddy tracker for primary branches)
 * - games.* → clean per-game URLs over the /games/* static files
 *   (/zero-blast → /games/zero-blast/index.html; also fixes the bare
 *   directory 404 — Next.js standalone serves no directory index)
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

  // Games subdomain → clean per-game URLs backed by /games/* static
  // files. Generic over the slug so future games work with no edit here.
  // Targets are built as PLAIN URLs, not nextUrl clones: NextURL re-applies
  // the incoming path's trailing-slash state to any pathname set on it,
  // which would strip the slash off "/zero-blast/" (a redirect loop) and
  // bolt one onto ".../index.html". The query string rides along — it
  // carries the QR's ?room= code.
  if (hostname.startsWith("games.")) {
    // Deliberately narrower than allowInternals: its image-extension
    // pass-through would strand a game's own relative images (they need
    // the /games prefix added below). Games only use these app assets.
    if (
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/favicon") ||
      pathname.startsWith("/logo")
    ) {
      return NextResponse.next();
    }
    const to = (p: string) => new URL(p + request.nextUrl.search, request.url);

    // Legacy /games/* paths on the subdomain → the clean form.
    if (pathname === "/games" || pathname === "/games/") {
      return NextResponse.redirect(to("/"), 308);
    }
    if (pathname.startsWith("/games/")) {
      return NextResponse.redirect(to(pathname.slice("/games".length)), 308);
    }

    // Shared runtime: game pages load ../shared/* which resolves to
    // /shared/* from a /<slug>/ page URL.
    if (pathname.startsWith("/shared/")) {
      return NextResponse.rewrite(to("/games" + pathname));
    }

    // Bare slug → trailing slash (redirect, so the browser URL gains the
    // slash and the page's RELATIVE asset urls resolve under the game
    // folder — a rewrite would leave them resolving at the root).
    if (/^\/[a-z0-9_-]+$/.test(pathname)) {
      return NextResponse.redirect(to(pathname + "/"), 308);
    }

    // /<slug>/ → the game page; anything deeper is an asset of that game.
    if (/^\/[a-z0-9_-]+\/$/.test(pathname)) {
      return NextResponse.rewrite(to("/games" + pathname + "index.html"));
    }
    if (/^\/[a-z0-9_-]+\//.test(pathname)) {
      return NextResponse.rewrite(to("/games" + pathname));
    }

    // Root: no games index page yet — front-door to the pilot game.
    // Swap for a rewrite to a landing page when the library grows.
    return NextResponse.redirect(to("/zero-blast/"), 308);
  }

  return NextResponse.next();
}

export const config = {
  // Run on all paths except static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
