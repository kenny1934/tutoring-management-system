"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getAppScroller } from "@/lib/scroll";

// Where each page was scrolled to, so going back puts you where you were, the
// way a phone's own apps do. The browser can't do this for us, because the app
// scrolls inside its frame, not the window. Kept for the browser tab's life.
const STORE_KEY = "csm-scroll-memory";
// How long a page has after going back to grow tall enough to scroll to its
// old place, while its lists load. After that it is left where it is.
const RESTORE_FOR_MS = 3000;
// Scrolling right after a page is swapped for another is the browser fitting
// the old position to the new page, not the person scrolling, so it is ignored.
const SWAP_SETTLE_MS = 400;

interface Place {
  /** The app frame's own scroll. */
  main: number;
  /** A page that scrolls in a box of its own keeps that box's scroll here. */
  inner: number;
}

const pageKey = () => location.pathname + location.search;

function readStore(): Record<string, Place> {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, Place>) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // Private browsing can refuse storage. Going back then starts at the top.
  }
}

// A box that is at least half the frame's height is the page's own scroller.
// Smaller boxes, like a list inside a card, aren't remembered.
function isPageBox(el: HTMLElement, main: HTMLElement) {
  const overflowY = getComputedStyle(el).overflowY;
  return (overflowY === "auto" || overflowY === "scroll") && el.clientHeight >= main.clientHeight / 2;
}

function findPageBox(main: HTMLElement): HTMLElement | null {
  let best: HTMLElement | null = null;
  for (const el of main.querySelectorAll<HTMLElement>("*")) {
    if (el.scrollHeight <= el.clientHeight || !isPageBox(el, main)) continue;
    if (!best || el.clientHeight > best.clientHeight) best = el;
  }
  return best;
}

/**
 * Remembers how far each page was scrolled and, when you go back or forward
 * to it, scrolls it there again once its content is tall enough. It gives up
 * if you start scrolling yourself first.
 */
export function ScrollMemory() {
  const pathname = usePathname();
  const swappedAt = useRef(0);
  const renderedPath = useRef<string | null>(null);

  // Runs as soon as a new page is on screen, before the browser reports any
  // scrolling it caused.
  useLayoutEffect(() => {
    swappedAt.current = performance.now();
    renderedPath.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const main = getAppScroller();
    if (!main) return;
    const store = readStore();
    let saveTimer: ReturnType<typeof setTimeout> | undefined;

    const onScroll = (e: Event) => {
      if (performance.now() - swappedAt.current < SWAP_SETTLE_MS) return;
      const target = e.target as HTMLElement;
      const key = pageKey();
      const place = store[key] ?? { main: 0, inner: 0 };
      if (target === main) place.main = main.scrollTop;
      else if (target instanceof HTMLElement && isPageBox(target, main)) place.inner = target.scrollTop;
      else return;
      store[key] = place;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => writeStore(store), 250);
    };
    // Scroll events don't bubble, so listening while they travel down catches
    // the page's own boxes as well as the frame.
    main.addEventListener("scroll", onScroll, { capture: true, passive: true });

    let restoring: ReturnType<typeof setInterval> | undefined;
    const stopRestoring = () => {
      clearInterval(restoring);
      restoring = undefined;
    };

    const onPopState = () => {
      stopRestoring();
      const key = pageKey();
      const place = store[key];
      if (!place) return;
      const startedAt = performance.now();
      const targetPath = location.pathname;
      // The frame is set even when its place is the top, because it may still
      // hold the scroll of the page being left. A page's own box starts at
      // its top anyway.
      let mainDone = false;
      let innerDone = place.inner <= 0;
      restoring = setInterval(() => {
        if (pageKey() !== key || performance.now() - startedAt > RESTORE_FOR_MS) return stopRestoring();
        // Wait for the page being returned to, not the one being left.
        if (renderedPath.current !== targetPath) return;
        if (!mainDone && main.scrollHeight - main.clientHeight >= place.main - 1) {
          main.scrollTop = place.main;
          mainDone = true;
        }
        if (!innerDone) {
          const box = findPageBox(main);
          if (box && box.scrollHeight - box.clientHeight >= place.inner - 1) {
            box.scrollTop = place.inner;
            innerDone = true;
          }
        }
        if (mainDone && innerDone) stopRestoring();
      }, 100);
    };
    window.addEventListener("popstate", onPopState);
    // Touching or scrolling the page yourself wins over putting it back.
    const userTookOver = () => stopRestoring();
    main.addEventListener("touchstart", userTookOver, { passive: true });
    main.addEventListener("wheel", userTookOver, { passive: true });

    return () => {
      main.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("popstate", onPopState);
      main.removeEventListener("touchstart", userTookOver);
      main.removeEventListener("wheel", userTookOver);
      stopRestoring();
      clearTimeout(saveTimer);
      writeStore(store);
    };
  }, []);

  return null;
}
