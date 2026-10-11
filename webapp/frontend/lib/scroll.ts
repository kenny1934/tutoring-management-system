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

/**
 * Scrolls the page back to its top, smoothly, the way tapping the tab you are
 * already on does in a phone's own apps. Some pages scroll in a box of their
 * own inside the app's scroller, so every box scrolled down inside it goes
 * back up too. Sideways scrolling is left where it is.
 *
 * @returns whether anything was scrolled down, so a caller can do something
 * else when the page is already at its top.
 */
export function scrollPageToTop(): boolean {
  const scroller = getAppScroller();
  if (!scroller) return false;
  const scrolled = [scroller, ...scroller.querySelectorAll<HTMLElement>("*")].filter((el) => {
    if (el.scrollTop <= 0) return false;
    const overflowY = getComputedStyle(el).overflowY;
    return overflowY === "auto" || overflowY === "scroll";
  });
  for (const el of scrolled) el.scrollTo({ top: 0, behavior: "smooth" });
  return scrolled.length > 0;
}
