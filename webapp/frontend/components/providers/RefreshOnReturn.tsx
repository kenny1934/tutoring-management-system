"use client";

import { useEffect } from "react";
import { useSWRConfig } from "swr";

// How long CSM has to be out of sight before coming back refreshes it. A quick
// look at another app and back shouldn't cost a round of requests.
const AWAY_MS = 2 * 60 * 1000;

/**
 * Refreshes what is on screen when someone comes back to CSM after a while in
 * another app or tab. An installed app has no reload button, and a tutor who
 * marks attendance, answers a parent on WhatsApp and comes back would
 * otherwise see the lessons as they were.
 *
 * The app turns SWR's own refresh-on-focus off, because it fires on every
 * focus. This fires once per return, and only for the data on the page in
 * view: SWR refetches a key only while something on screen uses it, so the
 * cost is about one page load.
 */
export function RefreshOnReturn() {
  const { mutate } = useSWRConfig();
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (hiddenAt !== null) {
        if (Date.now() - hiddenAt >= AWAY_MS) mutate(() => true);
        hiddenAt = null;
      }
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [mutate]);
  return null;
}
