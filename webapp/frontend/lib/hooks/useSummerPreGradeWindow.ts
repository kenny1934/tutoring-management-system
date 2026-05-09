"use client";

import { useEffect, useState } from "react";
import { summerAPI } from "@/lib/api";
import type { PreGradeWindow } from "@/lib/grade-utils";

let cached: PreGradeWindow | null = null;
let inFlight: Promise<PreGradeWindow> | null = null;

/**
 * Fetch the active summer config's pre-grade display window once and cache
 * it across components. The window is small and rarely changes, so a single
 * module-level cache is enough — no need for SWR/React Query plumbing.
 *
 * Returns `{ start: null, end: null }` until loaded; consumers should treat
 * a null/null window as "outside the window" via `isInPreGradeWindow`.
 */
export function useSummerPreGradeWindow(): PreGradeWindow {
  const [window, setWindow] = useState<PreGradeWindow>(cached ?? { start: null, end: null });

  useEffect(() => {
    if (cached) return;
    if (!inFlight) {
      inFlight = summerAPI
        .getPreGradeWindow()
        .then((w) => {
          cached = w;
          return w;
        })
        .catch(() => {
          // Don't poison the cache — clear inFlight so a later mount retries.
          inFlight = null;
          return { start: null, end: null } as PreGradeWindow;
        });
    }
    let active = true;
    inFlight.then((w) => {
      if (active) setWindow(w);
    });
    return () => {
      active = false;
    };
  }, []);

  return window;
}
