"use client";

import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { MAIN_CONTENT_ID } from "@/lib/scroll";
import { useHaptic } from "@/lib/useHaptic";

// How far the finger has to pull, after the drag is damped, before letting go
// refreshes. The ring stops at HOLD while the refresh runs.
const THRESHOLD = 72;
const HOLD = 56;
// A refresh shows its spinner at least this long, so a quick one still reads
// as having happened.
const MIN_SPIN_MS = 600;

// The ring follows the finger at a little over half its speed, and slower the
// further it goes, the way a phone's own pull-to-refresh feels heavy.
function damp(distance: number) {
  return Math.min(distance * 0.55, 120);
}

/**
 * Pull down from the top of the page to refresh, as in a phone's own apps.
 * Pages scroll inside the app's main box, not the window, so the browser's
 * own pull-to-refresh never fires, and an installed app has none at all.
 *
 * It refreshes the data on screen the same way coming back to the app does:
 * SWR refetches only what something on the page uses. It is only offered on a
 * touch screen, and only on the pages the layout passes `enabled` for, where a
 * downward drag can mean nothing else. A drag that starts inside anything
 * scrolled down, or that moves sideways first, is left alone.
 */
export function PullToRefresh({ enabled }: { enabled: boolean }) {
  const { mutate } = useSWRConfig();
  const { trigger } = useHaptic();
  const pull = useMotionValue(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  // The ring fades in and turns as it comes down, and is fully there at the
  // point where letting go would refresh.
  const opacity = useTransform(pull, [0, THRESHOLD * 0.6], [0, 1]);
  const rotate = useTransform(pull, [0, THRESHOLD], [0, 270]);
  const y = useTransform(pull, (value) => value - 40);

  useEffect(() => {
    if (!enabled || !window.matchMedia?.("(pointer: coarse)").matches) return;
    const main = document.getElementById(MAIN_CONTENT_ID);
    if (!main) return;

    let startX = 0;
    let startY: number | null = null;
    let pulling = false;
    let armed = false;

    // Everything between the finger and the main box has to be scrolled to
    // the top, or the drag is a scroll back up inside it.
    const atTop = (target: EventTarget | null) => {
      for (let el = target as HTMLElement | null; el; el = el.parentElement) {
        if (el.scrollTop > 0) return false;
        if (el === main) return true;
      }
      return true;
    };

    const onStart = (e: TouchEvent) => {
      startY = null;
      if (refreshingRef.current || e.touches.length !== 1 || !atTop(e.target)) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      pulling = false;
      armed = false;
    };

    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!pulling) {
        if (dy < 0 || Math.abs(dx) > 10) {
          startY = null;
          return;
        }
        if (dy < 10) return;
        if (Math.abs(dx) > dy) {
          startY = null;
          return;
        }
        pulling = true;
      }
      // While pulling, the page itself mustn't move or bounce.
      e.preventDefault();
      const distance = damp(dy);
      pull.set(distance);
      const nowArmed = distance >= THRESHOLD;
      if (nowArmed && !armed) trigger("selection");
      armed = nowArmed;
    };

    const onEnd = () => {
      if (startY === null || !pulling) {
        startY = null;
        return;
      }
      startY = null;
      pulling = false;
      if (!armed) {
        animate(pull, 0, { type: "spring", damping: 30, stiffness: 300 });
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      animate(pull, HOLD, { type: "spring", damping: 30, stiffness: 300 });
      const spin = new Promise((resolve) => window.setTimeout(resolve, MIN_SPIN_MS));
      Promise.all([mutate(() => true), spin]).finally(() => {
        animate(pull, 0, { duration: 0.2 }).then(() => {
          refreshingRef.current = false;
          setRefreshing(false);
        });
      });
    };

    main.addEventListener("touchstart", onStart, { passive: true });
    main.addEventListener("touchmove", onMove, { passive: false });
    main.addEventListener("touchend", onEnd);
    main.addEventListener("touchcancel", onEnd);
    return () => {
      main.removeEventListener("touchstart", onStart);
      main.removeEventListener("touchmove", onMove);
      main.removeEventListener("touchend", onEnd);
      main.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, mutate, pull, trigger]);

  if (!enabled) return null;

  return (
    <motion.div
      aria-hidden={!refreshing}
      role={refreshing ? "status" : undefined}
      aria-label={refreshing ? "Refreshing" : undefined}
      className="pointer-events-none absolute left-1/2 top-14 z-30 -ml-5 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-raised shadow-md md:top-0"
      style={{ y, opacity }}
    >
      <motion.span style={{ rotate }} className="flex">
        <RefreshCw className={refreshing ? "h-5 w-5 animate-spin text-accent-ink" : "h-5 w-5 text-accent-ink"} />
      </motion.span>
    </motion.div>
  );
}
