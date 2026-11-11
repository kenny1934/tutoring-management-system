"use client";

import { useEffect, useRef } from "react";

/**
 * On a touch screen, the back gesture or button closes the sheet or modal on
 * top, as it does in a phone's own apps, where before it left the page and
 * the overlay with it. This matters most once CSM is installed, because an
 * installed app has no browser back button, only the phone's gesture.
 *
 * It works through the browser's history. Opening an overlay adds an entry
 * for the same address, so back takes that entry off and closes the overlay
 * without leaving the page. Each entry carries the overlay's number, and
 * overlays opened on top of others get higher numbers, so back closes only
 * the one on top.
 *
 * An overlay can also close without back: its close button, a tap on the
 * backdrop, or an action that closes it on the way to somewhere else. Then its
 * entry is still there. If the page stays where it is, the entry is taken off
 * a moment later, so the next back doesn't seem to do nothing. If the overlay
 * closed because a link was followed, the new page's entry is already on top
 * by then, so the old one is left behind it, and coming back past it skips it.
 *
 * On a computer it does nothing, so the browser's back button there keeps
 * going back a page.
 */

const KEY = "csmOverlay";

// How long to wait, after an overlay closes without back, before taking its
// entry off. It gives a link the overlay was closed for time to add its own
// page's entry first, so going back never undoes the link.
const SETTLE_MS = 300;

let lastId = 0;
const openIds = new Set<number>();
let skipsStaleEntries = false;
const historyOwners = new Set<{ key: string; value: string }>();

/** A guarded workspace above a sheet temporarily owns Back and its history entry. */
export function protectOverlayHistory(key: string, value: string) {
  const owner = { key, value }; historyOwners.add(owner);
  return () => { historyOwners.delete(owner); };
}

export function hasStaleOverlayHistory() {
  const id = entryId();
  return id !== undefined && !openIds.has(id);
}

function currentEntryIsProtected() {
  return [...historyOwners].some(owner => window.history.state?.[owner.key] === owner.value);
}

function onTouchScreen() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
}

function entryId(): number | undefined {
  const id = window.history.state?.[KEY];
  return typeof id === "number" ? id : undefined;
}

// Going back onto the entry of an overlay that has since closed would show
// the same page and nothing else, so it goes back once more.
function skipStaleEntries() {
  if (skipsStaleEntries) return;
  skipsStaleEntries = true;
  window.addEventListener("popstate", () => {
    if (historyOwners.size) return;
    const id = entryId();
    if (id !== undefined && !openIds.has(id)) window.history.back();
  });
}

/**
 * @param open whether the overlay is open. Pass false as soon as it starts
 *   closing, so a sheet that slides away doesn't count as open while it does.
 * @param onBack closes the overlay. If it asks first, as a form with unsaved
 *   changes can, and stays open, its entry goes back so the next back asks
 *   again.
 */
export function useBackToClose(open: boolean, onBack: () => void) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!open || !onTouchScreen()) return;
    skipStaleEntries();
    const id = ++lastId;
    let popped = false;
    let navigating = false;
    const openedAt = window.location.href;
    // A Next link can still be loading when the close timer fires. Removing
    // its source history entry then cancels that navigation. Keep the closed
    // entry for the existing stale-entry handler to skip on the way back.
    const onLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin === window.location.origin && (destination.pathname !== window.location.pathname || destination.search !== window.location.search)) navigating = true;
    };
    document.addEventListener("click", onLink, true);
    const push = () => window.history.pushState({ [KEY]: id }, "");
    openIds.add(id);
    push();

    const onPopState = () => {
      if (popped) return;
      // An overlay opened above this one was the one closed.
      const landed = entryId();
      if (landed !== undefined && landed >= id) return;
      popped = true;
      onBackRef.current();
      window.setTimeout(() => {
        if (openRef.current && openIds.has(id)) {
          popped = false;
          push();
        }
      }, SETTLE_MS);
    };
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      openIds.delete(id);
      if (popped) { document.removeEventListener("click", onLink, true); return; }
      window.setTimeout(() => {
        document.removeEventListener("click", onLink, true);
        if (!navigating && window.location.href === openedAt && entryId() === id && !currentEntryIsProtected()) window.history.back();
      }, SETTLE_MS);
    };
  }, [open]);
}
