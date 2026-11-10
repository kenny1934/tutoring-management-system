/** Reveal a new selection within the roster without scrolling any ancestor of it. */
export function revealLessonSelection(scroller: HTMLElement, selected: HTMLElement) {
  const frame = scroller.getBoundingClientRect(), row = selected.getBoundingClientRect();
  if (!frame.height || !row.height) return;
  const gap = 12;
  if (row.top < frame.top + gap) scroller.scrollTop += row.top - frame.top - gap;
  else if (row.bottom > frame.bottom - gap) scroller.scrollTop += row.bottom - frame.bottom + gap;
}

/** Only the arrived pages move; their zoom, ink and reading position remain owned by the viewer. */
export function animateWorksheetReady(pages: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof pages.animate !== "function") return () => {};
  const animation = pages.animate([{ opacity: 0.84, translate: "0 4px" }, { opacity: 1, translate: "0 0" }], { duration: 160, easing: "cubic-bezier(.2,.7,.2,1)" });
  return () => animation.cancel();
}
