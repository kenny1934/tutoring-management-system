"use client";

import { useEffect, useState } from "react";

/** SSR-safe `matchMedia` subscription. Returns false on the server and on the
 *  first client paint, then corrects after mount (so it never mismatches the
 *  server-rendered HTML). Use for layout that can't be expressed in pure CSS,
 *  e.g. choosing between a docked side panel and a centered modal. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
