/**
 * The app scrolls inside LayoutShell's <main>, not the window: the shell is
 * a fixed h-dvh flex, so the window never moves and window.scrollTo /
 * window.scrollY are no-ops there. Anything needing "the page's scroll"
 * must go through this scroller.
 */
export const MAIN_CONTENT_ID = "main-content";

export const getAppScroller = (): HTMLElement | null =>
  document.getElementById(MAIN_CONTENT_ID);

/** Jump the app's scroller to the top, falling back to the window on pages
 *  rendered without the shell. Instant rather than smooth: callers use this
 *  for content swaps, not anchor jumps. */
export function scrollAppToTop() {
  const scroller = getAppScroller();
  if (scroller) scroller.scrollTo({ top: 0, behavior: "instant" });
  else window.scrollTo({ top: 0, behavior: "instant" });
}
