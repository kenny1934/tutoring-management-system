"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Calendar, MapPin, Users, X } from "lucide-react";
import { getAppScroller, MAIN_CONTENT_ID } from "@/lib/scroll";
import { useOverlayLayer } from "@/hooks/useOverlayLayer";
import { hasStaleOverlayHistory } from "@/hooks/useBackToClose";
import { formatShortDate } from "@/lib/formatters";
import { animateSessionIdentity } from "./sessionDetailMotion";
import { animateLessonOpening, guardLessonHistory, lessonFrameOrigin, LESSON_OPEN_EVENT, LESSON_FRAME_PARAMETER, type LessonOpening } from "./lessonFrame";
import styles from "./NativePreview.module.css";

/** Desktop navigation remains available; background panels stay mounted out of sight. */
function suspendLessonBackground(main: HTMLElement, host: HTMLElement, phone: boolean) {
  const siblings = [...document.body.children].filter((node): node is HTMLElement => node instanceof HTMLElement && !node.contains(host) && !["SCRIPT", "STYLE"].includes(node.tagName));
  const nodes = phone ? siblings : [main, ...siblings.filter(node => !node.contains(main) && !node.matches("[data-sidebar-panel]") && !node.querySelector("[data-sidebar-panel]"))];
  const saved = nodes.map(node => ({ node, inert: node.inert, visibility: node.style.visibility }));
  for (const { node } of saved) {
    node.inert = true;
    if (!phone && node !== main) node.style.visibility = "hidden";
  }
  return () => { for (const { node, inert, visibility } of saved) { node.inert = inert; node.style.visibility = visibility; } };
}

function lessonBounds(main: HTMLElement) {
  const rect = main.getBoundingClientRect();
  const transform = getComputedStyle(main).transform;
  const parent = main.offsetParent;
  if (transform && transform !== "none" && parent instanceof HTMLElement && main.offsetWidth) {
    const outer = parent.getBoundingClientRect();
    return new DOMRect(outer.left + parent.clientLeft + main.offsetLeft - parent.scrollLeft,
      outer.top + parent.clientTop + main.offsetTop - parent.scrollTop, main.offsetWidth, main.offsetHeight);
  }
  return rect;
}

function LessonFrame({ opening, onClosed, onNavigate, onNavigationCancelled }: {
  opening: LessonOpening; onClosed: () => void;
  onNavigate: (link: HTMLAnchorElement, token: string) => void; onNavigationCancelled: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [frameOffset, setFrameOffset] = useState({ left: 0, top: 0 });
  const [bounds, setBounds] = useState<DOMRect | null>(null);
  const host = useRef<HTMLDivElement>(null), surface = useRef<HTMLDivElement>(null), frame = useRef<HTMLIFrameElement>(null), identity = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false), closing = useRef(false), exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [token] = useState(() => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  });
  const { zIndex, isTopmost } = useOverlayLayer(true, { lockScroll: true });
  const onClosedRef = useRef(onClosed); onClosedRef.current = onClosed;
  const navigation = useRef({ onNavigate, onNavigationCancelled }); navigation.current = { onNavigate, onNavigationCancelled };
  const navigationRequested = useRef(false);
  const measureFrame = useRef<(() => void) | null>(null);
  const url = new URL(opening.href, window.location.href); url.searchParams.set(LESSON_FRAME_PARAMETER, token);
  const targetOrigin = lessonFrameOrigin() === "null" ? "*" : lessonFrameOrigin();

  const finish = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (frame.current) { frame.current.inert = true; frame.current.style.pointerEvents = "none"; }
    if (surface.current) animateLessonOpening(surface.current, opening.from, true);
    exitTimer.current = setTimeout(() => onClosedRef.current(), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240);
  }, [opening]);
  const requestExit = useCallback(() => {
    if (!readyRef.current) { finish(); return; }
    frame.current?.contentWindow?.postMessage({ type: "csm-wide-exit-request", token: token }, targetOrigin);
  }, [finish, targetOrigin, token]);

  useLayoutEffect(() => {
    const main = getAppScroller();
    if (!main || !host.current) return;
    let restoreBackground = () => {};
    let wasPhone: boolean | null = null;
    let childMain: HTMLElement | null = null;
    const observer = new ResizeObserver(() => measure());
    const measure = () => {
      const rect = lessonBounds(main);
      const phone = window.matchMedia("(max-width: 767px)").matches;
      if (phone !== wasPhone) {
        restoreBackground();
        restoreBackground = suspendLessonBackground(main, host.current!, phone);
        wasPhone = phone;
      }
      const nextChild = frame.current?.contentDocument?.getElementById(MAIN_CONTENT_ID) ?? null;
      if (nextChild !== childMain) {
        if (childMain) observer.unobserve?.(childMain);
        childMain = nextChild;
        if (childMain) observer.observe(childMain);
      }
      // The iframe has its own cropped sidebar. Measure its offset, since the
      // parent sidebar can collapse independently while a lesson is open.
      const offset = childMain ? lessonBounds(childMain) : rect;
      setFrameOffset(previous => previous.left === offset.left && previous.top === offset.top ? previous : { left: offset.left, top: offset.top });
      const next = phone ? new DOMRect(0, 0, window.innerWidth, window.innerHeight) : rect;
      setBounds(previous => previous && previous.left === next.left && previous.top === next.top && previous.width === next.width && previous.height === next.height ? previous : next);
    };
    measureFrame.current = measure; observer.observe(main); measure();
    window.addEventListener("resize", measure);
    const scrollers = [main, ...main.querySelectorAll<HTMLElement>("*")].filter(el => el.scrollTop || el.scrollLeft).map(el => ({ el, top: el.scrollTop, left: el.scrollLeft }));
    host.current.focus({ preventScroll: true });
    const removeHistory = guardLessonHistory(token, requestExit);
    const navigate = (event: MouseEvent) => {
      if (wasPhone || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link?.closest("[data-sidebar-panel]") || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      if (new URL(link.href).origin !== window.location.origin) return;
      event.preventDefault(); event.stopPropagation();
      navigation.current.onNavigate(link, token);
      if (navigationRequested.current || closing.current) return;
      navigationRequested.current = true;
      if (!readyRef.current) finish();
      else frame.current?.contentWindow?.postMessage({ type: "csm-wide-navigate-request", token }, targetOrigin);
    };
    document.addEventListener("click", navigate, true);
    return () => {
      observer.disconnect(); window.removeEventListener("resize", measure); removeHistory();
      document.removeEventListener("click", navigate, true); measureFrame.current = null;
      if (exitTimer.current !== null) clearTimeout(exitTimer.current);
      restoreBackground();
      scrollers.forEach(({ el, top, left }) => { if (el.isConnected) { el.scrollTop = top; el.scrollLeft = left; } });
      const returnFocus = opening.returnFocus?.isConnected ? opening.returnFocus : opening.source;
      if (returnFocus.isConnected && !returnFocus.closest("[inert]")) returnFocus.focus({ preventScroll: true });
    };
  }, [opening, requestExit, token, finish, targetOrigin]);

  useLayoutEffect(() => {
    if (!surface.current || !bounds) return;
    const cancel = animateLessonOpening(surface.current, opening.from);
    const cancelIdentity = opening.identity && identity.current ? animateSessionIdentity(opening.identity, identity.current, surface.current, false, zIndex + 1) : () => {};
    return () => { cancel(); cancelIdentity(); };
    // Resizing changes the bounds without replaying the arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!bounds]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== lessonFrameOrigin() || event.data?.token !== token) return;
      if (event.data.type === "csm-wide-ready" && !readyRef.current) {
        measureFrame.current?.();
        readyRef.current = true; setReady(true); frame.current?.focus({ preventScroll: true });
      }
      if (event.data.type === "csm-wide-navigation-cancelled") {
        navigationRequested.current = false; navigation.current.onNavigationCancelled();
      }
      if (event.data.type === "csm-wide-closed") finish();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [finish, token]);

  return createPortal(<div ref={host} tabIndex={-1} role="dialog" aria-label={opening.kind === "single" ? "Student lesson" : "Whole class lesson"} aria-modal={window.matchMedia("(max-width: 767px)").matches || undefined} className={styles.lessonJourneyHost} style={{ zIndex, pointerEvents: "none" }} onKeyDown={event => { if (event.key === "Escape" && isTopmost) { event.stopPropagation(); requestExit(); } }}>
    {bounds && <div ref={surface} data-native-lesson-opening className={styles.lessonJourneySurface} style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, pointerEvents: "auto" }}>
      <div className={styles.lessonJourneyLoading} aria-hidden={ready || undefined} inert={ready || undefined}>
        <div className={styles.lessonJourneyContext}><Users size={16} /><strong ref={opening.student ? undefined : identity}>{[opening.tutor, opening.slot].filter(Boolean).join(" · ")}</strong><span><Calendar size={13} />{formatShortDate(opening.date)}</span><span><MapPin size={13} />{opening.location}</span><button onClick={requestExit} aria-label="Cancel opening lesson"><X size={18} /></button></div>
        {opening.student && <div ref={identity} className={styles.lessonJourneyIdentity}><strong>{opening.student}</strong>{opening.grade && <span>{opening.grade}</span>}{opening.school && <span>{opening.school}</span>}</div>}
        {!ready && <span role="status" className={styles.lessonJourneyStatus}>Loading...</span>}
      </div>
      <iframe ref={frame} title={opening.kind === "single" ? "Student lesson workspace" : "Wide lesson workspace"} src={url.href} className={styles.lessonJourneyFrame} data-ready={ready} style={{ left: -frameOffset.left, top: -frameOffset.top, width: bounds.width + frameOffset.left, height: bounds.height + frameOffset.top }} onLoad={() => { const doc = frame.current?.contentDocument; if (doc) doc.documentElement.classList.toggle("dark", document.documentElement.classList.contains("dark")); measureFrame.current?.(); }} />
    </div>}
  </div>, document.body);
}

/** Holds the actual lesson in a same-origin frame so the source page survives the entire lesson. */
export function NativeWideLessonJourney({ root, enabled }: { root: RefObject<HTMLDivElement | null>; enabled: boolean }) {
  const [opening, setOpening] = useState<LessonOpening | null>(null);
  const currentOpening = useRef(opening); currentOpening.current = opening;
  const pendingNavigation = useRef<{ link: HTMLAnchorElement; token: string; beforeNavigate?: () => void } | null>(null);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pendingNavigation.current = null; };
  }, []);
  useLayoutEffect(() => {
    const follow = () => {
      const pending = pendingNavigation.current;
      if (currentOpening.current || !pending || window.history.state?.csmWideLesson === pending.token || hasStaleOverlayHistory()) return;
      pendingNavigation.current = null;
      // Let every Back listener settle before replaying the actual Next link.
      queueMicrotask(() => {
        if (!mounted.current || currentOpening.current || !pending.link.isConnected) return;
        pending.beforeNavigate?.(); pending.link.click();
      });
    };
    window.addEventListener("popstate", follow); follow();
    return () => window.removeEventListener("popstate", follow);
  }, [opening]);
  useEffect(() => {
    if (!enabled) return;
    const onOpen = (event: Event) => {
      const request = event as CustomEvent<LessonOpening>;
      if (!root.current?.contains(request.detail.source)) return;
      // Phone lessons enter from their slot header, student row or detail-page lesson button.
      if (!window.matchMedia("(min-width: 768px)").matches && !request.detail.source.closest("[data-native-lesson-slot], [data-native-session-row], [data-native-single-lesson-source]")) return;
      const url = new URL(request.detail.href, window.location.href);
      const targetMatches = request.detail.kind === "single"
        ? /^\/sessions\/[1-9]\d*$/.test(url.pathname) && url.searchParams.get("lesson") === "true"
        : url.pathname === "/sessions/lesson";
      if (url.origin !== window.location.origin || !targetMatches) return;
      if (!currentOpening.current) pendingNavigation.current = null;
      request.preventDefault(); setOpening(current => current ?? request.detail);
    };
    window.addEventListener(LESSON_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(LESSON_OPEN_EVENT, onOpen);
  }, [enabled, root]);
  return opening ? <LessonFrame opening={opening} onClosed={() => setOpening(null)}
    onNavigate={(link, token) => { pendingNavigation.current = { link, token, beforeNavigate: opening.beforeNavigate }; }}
    onNavigationCancelled={() => { pendingNavigation.current = null; }} /> : null;
}
