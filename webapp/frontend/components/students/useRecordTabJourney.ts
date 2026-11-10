"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

// Keep places for the browser tab's lifetime so returning through the sidebar or
// Back can resume a record after Next has unmounted its page. No record data is kept.
const recordPositions = new Map<string | number | null, Map<string, number>>();
function positionsFor(recordId: string | number | null) {
  const places = recordPositions.get(recordId) ?? new Map<string, number>();
  recordPositions.delete(recordId);
  recordPositions.set(recordId, places);
  if (recordPositions.size > 24) recordPositions.delete(recordPositions.keys().next().value!);
  return places;
}

/** Each record tab uses the page's existing scroller, including late-loading content. */
export function useRecordTabJourney<T extends string>({ recordId, activeTab, order, scrollerRef, contentRef, anchorRef, ready = true }: {
  recordId: string | number | null;
  activeTab: T;
  order: readonly T[];
  scrollerRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  anchorRef: RefObject<HTMLDivElement | null>;
  ready?: boolean;
}) {
  const positions = useRef(new Map<string, number>());
  const restoringTab = useRef<T | null>(null);
  const [direction, setDirection] = useState(1);

  const prepareTab = useCallback((next: T) => {
    if (next === activeTab) return;
    if (scrollerRef.current && restoringTab.current !== activeTab) positions.current.set(activeTab, scrollerRef.current.scrollTop);
    setDirection(Math.sign(order.indexOf(next) - order.indexOf(activeTab)) || 1);
  }, [activeTab, order, scrollerRef]);

  useLayoutEffect(() => {
    if (!ready) return;
    positions.current = positionsFor(recordId);
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const target = positions.current.get(activeTab) ?? 0;
    const previousPadding = scroller.style.scrollPaddingTop;
    const padForIdentity = () => {
      scroller.style.scrollPaddingTop = `${(anchorRef.current?.offsetHeight ?? 0) + 12}px`;
    };
    const anchorObserver = new ResizeObserver(padForIdentity);
    if (anchorRef.current) anchorObserver.observe(anchorRef.current);
    padForIdentity();
    let restoring = true;
    restoringTab.current = activeTab;
    const restore = () => {
      if (!restoring) return;
      scroller.scrollTop = target;
      if (Math.abs(scroller.scrollTop - target) < 1) {
        restoring = false;
        restoringTab.current = null;
        observer?.disconnect();
      }
    };
    const takeOver = () => {
      restoring = false;
      restoringTab.current = null;
      observer?.disconnect();
      positions.current.set(activeTab, scroller.scrollTop);
    };
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Tab"].includes(event.key)) takeOver();
    };
    const remember = () => {
      if (!restoring) positions.current.set(activeTab, scroller.scrollTop);
    };
    const observer = new ResizeObserver(restore);
    observer.observe(content);
    restore();
    const frame = requestAnimationFrame(restore);
    scroller.addEventListener("scroll", remember, { passive: true });
    scroller.addEventListener("wheel", takeOver, { passive: true });
    scroller.addEventListener("touchstart", takeOver, { passive: true });
    scroller.addEventListener("pointerdown", takeOver);
    scroller.addEventListener("keydown", onKey);
    return () => {
      restoring = false;
      restoringTab.current = null;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      anchorObserver.disconnect();
      scroller.style.scrollPaddingTop = previousPadding;
      scroller.removeEventListener("scroll", remember);
      scroller.removeEventListener("wheel", takeOver);
      scroller.removeEventListener("touchstart", takeOver);
      scroller.removeEventListener("pointerdown", takeOver);
      scroller.removeEventListener("keydown", onKey);
    };
  }, [recordId, activeTab, scrollerRef, contentRef, anchorRef, ready]);

  return { prepareTab, direction };
}
