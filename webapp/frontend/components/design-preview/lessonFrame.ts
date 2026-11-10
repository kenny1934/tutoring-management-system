import { protectOverlayHistory } from "@/hooks/useBackToClose";

export const LESSON_DISMISS_OVERLAY_EVENT = "csm-native-lesson-dismiss-overlay";

/** An overlay above the lesson gets the first chance to answer the host's Back request. */
export function dismissLessonOverlay() {
  return !window.dispatchEvent(new Event(LESSON_DISMISS_OVERLAY_EVENT, { cancelable: true }));
}

export const LESSON_OPEN_EVENT = "csm-native-wide-lesson-open";
export const LESSON_FRAME_PARAMETER = "lesson_frame";

/** Local file frames have opaque message origins even when location.origin says file://. */
export function lessonFrameOrigin() {
  return window.location.protocol === "file:" ? "null" : window.location.origin;
}

export type LessonOpening = {
  href: string;
  source: HTMLElement;
  /** A detail sheet can remain open while its row supplies the transition origin. */
  returnFocus?: HTMLElement | null;
  identity?: HTMLElement | null;
  from: Pick<DOMRect, "left" | "top" | "right" | "bottom">;
  tutor: string;
  slot: string;
  date: string;
  location: string;
  student?: string;
  grade?: string | null;
  school?: string | null;
  beforeNavigate?: () => void;
};

/** A mounted source page can accept the ordinary click; modified clicks keep their native link behaviour. */
export function requestLessonOpening(opening: LessonOpening) {
  const event = new CustomEvent<LessonOpening>(LESSON_OPEN_EVENT, { detail: opening, cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

export function lessonFrameToken() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(LESSON_FRAME_PARAMETER);
}

/** The child asks its existing exit/ink guard before it tells the host it can close. */
export function connectLessonFrame(attemptExit: () => void, stage?: HTMLElement | null, attemptNavigation = attemptExit) {
  const token = lessonFrameToken();
  if (!token || window.parent === window) return () => {};
  // The host supplies the app navigation. Keep the child's cropped copy out of keyboard navigation.
  const outside: { el: HTMLElement; inert: boolean }[] = [];
  let branch = stage;
  while (branch?.parentElement) {
    const parent = branch.parentElement;
    for (const el of parent.children) if (el !== branch && el instanceof HTMLElement && !["SCRIPT", "STYLE"].includes(el.tagName)) {
      outside.push({ el, inert: el.inert }); el.inert = true;
    }
    if (parent === document.body) break;
    branch = parent;
  }
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent || event.origin !== lessonFrameOrigin() || event.data?.token !== token) return;
    if (event.data.type === "csm-wide-exit-request") attemptExit();
    if (event.data.type === "csm-wide-navigate-request") attemptNavigation();
  };
  window.addEventListener("message", onMessage);
  window.parent.postMessage({ type: "csm-wide-ready", token }, lessonFrameOrigin() === "null" ? "*" : lessonFrameOrigin());
  return () => {
    window.removeEventListener("message", onMessage);
    outside.forEach(({ el, inert }) => { el.inert = inert; });
  };
}

export function cancelLessonFrameNavigation() {
  const token = lessonFrameToken();
  if (!token || window.parent === window) return;
  window.parent.postMessage({ type: "csm-wide-navigation-cancelled", token }, lessonFrameOrigin() === "null" ? "*" : lessonFrameOrigin());
}

export function closeLessonFrame() {
  const token = lessonFrameToken();
  if (!token || window.parent === window) return false;
  window.parent.postMessage({ type: "csm-wide-closed", token }, lessonFrameOrigin() === "null" ? "*" : lessonFrameOrigin());
  return true;
}

const pendingHistoryCleanup = new Map<string, object>();

/** Back asks the lesson to save; a lesson that needs confirmation remains mounted. */
export function guardLessonHistory(token: string, attemptExit: () => void) {
  const releaseOverlayHistory = protectOverlayHistory("csmWideLesson", token);
  const href = window.location.href;
  const push = () => window.history.pushState({ ...window.history.state, csmWideLesson: token }, "", href);
  let closing = false;
  // Strict Mode reconnects effects immediately. Reuse that lesson's existing
  // entry and cancel its pending cleanup instead of moving browser history.
  pendingHistoryCleanup.delete(token);
  if (window.history.state?.csmWideLesson !== token) push();
  const onBack = () => {
    if (closing || window.history.state?.csmWideLesson === token) return;
    push();
    attemptExit();
  };
  window.addEventListener("popstate", onBack);
  return () => {
    closing = true;
    window.removeEventListener("popstate", onBack);
    releaseOverlayHistory();
    const pending = {};
    pendingHistoryCleanup.set(token, pending);
    queueMicrotask(() => {
      if (pendingHistoryCleanup.get(token) !== pending) return;
      pendingHistoryCleanup.delete(token);
      if (window.location.href === href && window.history.state?.csmWideLesson === token) window.history.back();
    });
  };
}

export function animateLessonOpening(surface: HTMLElement, from: LessonOpening["from"], reverse = false) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof surface.animate !== "function") return () => {};
  const rect = surface.getBoundingClientRect();
  const inset = (value: number, max: number) => Math.max(0, Math.min(value, max));
  const small = { clipPath: `inset(${inset(from.top - rect.top, rect.height)}px ${inset(rect.right - from.right, rect.width)}px ${inset(rect.bottom - from.bottom, rect.height)}px ${inset(from.left - rect.left, rect.width)}px round 6px)` };
  const full = { clipPath: "inset(0px 0px 0px 0px round 0px)" };
  const animation = surface.animate(reverse ? [full, small] : [small, full], { duration: reverse ? 240 : 420, easing: "cubic-bezier(.2,.7,.2,1)", fill: reverse ? "forwards" : "none" });
  return () => animation.cancel();
}
