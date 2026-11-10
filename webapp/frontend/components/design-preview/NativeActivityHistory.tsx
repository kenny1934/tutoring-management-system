"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import useSWRInfinite from "swr/infinite";
import { X } from "lucide-react";
import { statsAPI } from "@/lib/api";
import { useTutors } from "@/lib/hooks";
import { getAppScroller } from "@/lib/scroll";
import { useAsSheet } from "@/hooks/usePopoverSheet";
import { useOverlayLayer } from "@/hooks/useOverlayLayer";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import type { ActivityEvent } from "@/types";
import { useNativeNavigationMemory, useNativeViewState } from "./NativeNavigationMemory";
import { NativeActivityRows } from "./NativeActivityRows";
import { recessSessionBackground } from "./sessionDetailMotion";
import styles from "./NativePreview.module.css";

const BATCH = 50;
type ReadingPlace = { top: number; id?: string; offset?: number };

export function NativeActivityHistory({ scope, location, tutorId, onClose }: {
  scope: string; location: string; tutorId?: number; onClose: () => void;
}) {
  const onPhone = useAsSheet();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(true);
  const titleId = useId();
  const dialog = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const memory = useNativeNavigationMemory();
  const key = `dashboard:activity-history:${scope}`;
  const [pages, setPages] = useNativeViewState<number>(`${key}:pages`, () => 1);
  const place = useRef(memory?.get<ReadingPlace>(`${key}:place`) ?? { top: 0 });
  const restored = useRef(false);
  const layer = useOverlayLayer(!onPhone, { lockScroll: true });
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<ActivityEvent[]>(
    (index, previous: ActivityEvent[] | null) => previous && previous.length < BATCH ? null : ["native-activity-history", location, tutorId ?? null, index],
    ([, where, tutor, index]: [string, string, number | null, number]) => statsAPI.getActivityFeed(where, tutor ?? undefined, BATCH, index * BATCH),
    { initialSize: pages, revalidateOnFocus: false, revalidateFirstPage: false },
  );
  const { data: tutors } = useTutors();
  const unique = new Map<string, ActivityEvent>();
  (data ?? []).flat().forEach(event => { if (!unique.has(event.id)) unique.set(event.id, event); });
  const events = [...unique.values()];
  const hasMore = data?.at(-1)?.length === BATCH;
  const close = () => { if (onPhone) onClose(); else setOpen(false); };

  // The shared phone sheet owns its scroller. Desktop has one body scroller.
  const getScroller = useCallback(() => onPhone ? body.current?.closest<HTMLElement>('[role="dialog"]') : body.current, [onPhone]);
  useLayoutEffect(() => {
    const complete = data && (data.length >= size || (data.at(-1)?.length ?? BATCH) < BATCH);
    if (restored.current || (!error && !complete)) return;
    const scroller = getScroller(); if (!scroller) return;
    const saved = place.current;
    const anchor = [...scroller.querySelectorAll<HTMLElement>("[data-activity-row]")].find(row => row.dataset.activityRow === saved.id);
    scroller.scrollTop = anchor && saved.offset !== undefined
      ? scroller.scrollTop + anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top - saved.offset
      : saved.top;
    restored.current = true;
  });
  useEffect(() => {
    const main = getAppScroller();
    if (onPhone && main) return recessSessionBackground(main, true, styles.sessionBackground);
  }, [onPhone]);
  useEffect(() => {
    const scroller = getScroller(); if (!scroller) return;
    const remember = () => {
      if (!restored.current || !scroller.isConnected) return;
      const top = scroller.getBoundingClientRect().top;
      const header = onPhone && scroller.firstElementChild instanceof HTMLElement ? scroller.firstElementChild.offsetHeight : 0;
      const anchor = [...scroller.querySelectorAll<HTMLElement>("[data-activity-row]")].find(row => row.getBoundingClientRect().bottom > top + header);
      memory?.set<ReadingPlace>(`${key}:place`, { top: scroller.scrollTop, id: anchor?.dataset.activityRow, offset: anchor ? anchor.getBoundingClientRect().top - top : undefined });
    };
    scroller.addEventListener("scroll", remember, { passive: true });
    return () => { remember(); scroller.removeEventListener("scroll", remember); };
  }, [onPhone, memory, key, getScroller]);

  useEffect(() => {
    if (onPhone || !dialog.current) return;
    const surface = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const main = getAppScroller();
    const oldInert = main?.inert, overflow = main?.style.overflow, top = main?.scrollTop;
    const route = window.location.href;
    if (main) { main.inert = true; main.style.overflow = "hidden"; }
    surface.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => {
      if (main) { main.inert = oldInert ?? false; main.style.overflow = overflow ?? ""; if (window.location.href === route && top !== undefined) main.scrollTop = top; }
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [onPhone]);
  useEffect(() => {
    if (onPhone || !layer.isTopmost) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      if (event.key !== "Tab" || !dialog.current) return;
      const targets = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = targets[0], last = targets.at(-1);
      if (!first) { event.preventDefault(); dialog.current.focus(); }
      else if (!dialog.current.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onPhone, layer.isTopmost]);

  const content = <div ref={body} className={styles.activityHistoryBody} data-native-scroll="activity-history">
    {error && <div role="status" className={styles.activityError}>Couldn’t load activity. <button type="button" onClick={() => void mutate()}>Try again</button></div>}
    {isLoading && !data ? <p className={styles.activityEmpty}>Loading activity…</p>
      : <NativeActivityRows events={events} tutors={tutors} location={location} onNavigate={close} />}
    {!isLoading && !error && !events.length && <p className={styles.activityEmpty}>No activity found</p>}
    {hasMore && !error && <div className={styles.activityLoadMore}>
      <button type="button" disabled={isValidating} onClick={() => { setPages(size + 1); void setSize(size + 1); }}>{isValidating ? "Loading…" : "Load more"}</button>
    </div>}
  </div>;
  if (onPhone) return <MobileBottomSheet isOpen onClose={onClose} title="All activity" modalLabel="All activity" className={styles.activityHistorySheet}>{content}</MobileBottomSheet>;
  return createPortal(<AnimatePresence onExitComplete={onClose}>{open && <motion.div className={styles.activityOverlay} style={{ zIndex: layer.zIndex }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .15 }}>
    <div className={styles.activityBackdrop} onClick={() => { if (layer.isTopmost) setOpen(false); }} />
    <section ref={dialog} className={styles.activityHistoryDialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header><h2 id={titleId}>All activity</h2><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X aria-hidden="true" /></button></header>
      {content}
    </section>
  </motion.div>}</AnimatePresence>, document.body);
}
