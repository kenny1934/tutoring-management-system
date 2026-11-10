/** Keep the selected student explicit when opening a whole-class lesson. */
export function lessonHref(href: string, sessionId?: number) {
  const url = new URL(href, "https://csm.invalid");
  url.searchParams.delete("ui-preview");
  if (sessionId !== undefined) url.searchParams.set("lesson_session", String(sessionId));
  return url.pathname + url.search + url.hash;
}

export function animateLessonArrival(stage: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof stage.animate !== "function") return () => {};
  const animation = stage.animate([
    { opacity: 0.85, translate: "0 12px" }, { opacity: 1, translate: "0 0" },
  ], { duration: 320, easing: "cubic-bezier(.2,.7,.2,1)" });
  return () => animation.cancel();
}

/** Keeps the same mounted worksheet in view as its surrounding chrome folds away. */
export function animateLessonFocus(viewer: HTMLElement, before: Pick<DOMRect, "left" | "top">) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof viewer.animate !== "function") return () => {};
  const after = viewer.getBoundingClientRect();
  const x = before.left - after.left, y = before.top - after.top;
  if (Math.abs(x) < 1 && Math.abs(y) < 1) return () => {};
  const animation = viewer.animate([
    { translate: `${x}px ${y}px` }, { translate: "0 0" },
  ], { duration: 240, easing: "cubic-bezier(.2,.7,.2,1)" });
  return () => animation.cancel();
}
