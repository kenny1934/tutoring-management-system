/**
 * What counts as parent-facing, in one place.
 *
 * AuthGuard and LayoutShell both have to answer "is this page public?", and
 * each used to carry its own copy of the answer. When the regular subdomain
 * was added the copies drifted: LayoutShell learned about it, AuthGuard did
 * not, and every logged-out parent on the application form got a spinner while
 * the guard bounced them to a login page the middleware sent straight back.
 * Adding a subdomain should be one edit here, not a hunt for every list that
 * needs it.
 *
 * Public means "no session required". /zen is deliberately absent: those pages
 * render without the admin shell but are staff-only, so LayoutShell asks about
 * them separately.
 */

/** The September intake form, absolute. Summer's out-of-season pages link
 *  here to send a parent somewhere that can still take their application, and
 *  they are on summer.* when they follow it, so a relative path will not do.
 *  It sits here with the other public-route facts rather than in either
 *  intake's helper module, so neither has to import the other's. */
export const REGULAR_APPLY_URL =
  "https://regular.mathconceptsecondary.academy/apply";

/** Hostname prefixes of the parent-facing subdomains. */
export const PUBLIC_SUBDOMAIN_PREFIXES = [
  "prospect.",
  "summer.",
  "buddy.",
  "regular.",
] as const;

/**
 * Path prefixes served without a session.
 *
 * /summer and /regular hold only parent-facing pages, the staff views for both
 * living under /admin. /apply and /status are the clean URLs the subdomains
 * rewrite from, and they are listed because a hostname cannot be read during
 * server rendering, so the visible path has to stand on its own.
 */
export const PUBLIC_ROUTE_PREFIXES = [
  "/summer",
  "/regular",
  "/apply",
  "/status",
] as const;

/** True on a parent-facing subdomain. Always false during server rendering,
 *  where there is no hostname to read, so pair it with isPublicPath. */
export function isPublicSubdomain(hostname?: string): boolean {
  const host = hostname ?? (typeof window !== "undefined" ? window.location.hostname : "");
  if (!host) return false;
  return PUBLIC_SUBDOMAIN_PREFIXES.some((prefix) => host.startsWith(prefix));
}

/** True for a path that never requires a session. */
export function isPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
