/** Filters that live in the address bar.
 *
 *  A list somebody has narrowed down is worth handing to a colleague, and the
 *  only way to hand over a browser view is to hand over its URL. Session
 *  storage held your place across a refresh but could not do that, which is
 *  the whole reason this exists.
 *
 *  Everything here merges rather than replaces, and that is the important
 *  part. Two components own different halves of the retention board's query
 *  string: the page owns the year, the branch and which tab is open, and the
 *  chase list owns its own filters. A writer that rebuilt the whole string out
 *  of its own state would wipe the other one's keys every time it ran, so each
 *  writer is only ever handed the keys it owns.
 */
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** The query string as it stands, and an empty one during a server render. */
export function currentQuery(): URLSearchParams {
  return new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
}

/** `current` with `values` written over it.
 *
 *  A null, undefined or empty value removes its key rather than writing an
 *  empty one, so a filter sitting at its default leaves no trace and an
 *  untouched page has a plain URL. */
export function mergeQuery(
  current: string,
  values: Record<string, string | null | undefined>
): string {
  const params = new URLSearchParams(current);
  for (const [key, value] of Object.entries(values)) {
    if (value == null || value === "") params.delete(key);
    else params.set(key, value);
  }
  return params.toString();
}

/** Keeps the keys it is given in step with the address bar.
 *
 *  `ready` is not optional politeness. A component reads its filters out of
 *  the URL once it has mounted, and until then its state is still the
 *  defaults; writing those out would empty the query string of the very link
 *  somebody had just followed. So nothing is written until the caller says it
 *  has finished reading.
 *
 *  Replaces rather than pushes, so working through a filtered list does not
 *  fill the back button with every narrowing you tried on the way. */
export function useQuerySync(
  values: Record<string, string | null | undefined>,
  ready: boolean
): void {
  const router = useRouter();
  // A fresh object every render, so the effect keys off what is in it.
  const encoded = JSON.stringify(values);

  useEffect(() => {
    if (!ready) return;
    const next = mergeQuery(window.location.search, JSON.parse(encoded));
    if (next === window.location.search.replace(/^\?/, "")) return;
    router.replace(next ? `?${next}` : window.location.pathname, { scroll: false });
  }, [encoded, ready, router]);
}
