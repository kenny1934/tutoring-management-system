/**
 * How the dashboard's quick links look. Four of them live in the header and
 * three in their own components (Make-up, Trials and Leave), so they share
 * these classes to stay alike.
 *
 * From 640px up a quick link is a pill, and the links wrap along a line. On a
 * phone a pill per link wrapped into four rows and pushed today's lessons off
 * the first screen, so there each link becomes a tile instead, four to a row
 * as the More sheet's are: the icon over a short label, any count in the
 * tile's corner, and no arrow, since every tile opens something when tapped.
 * Each link keeps its own background colour.
 */
export const QUICK_LINK =
  "inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-medium transition-all " +
  "border border-line-strong text-accent-ink hover:bg-tint hover:shadow-sm " +
  "max-sm:relative max-sm:h-[60px] max-sm:w-full max-sm:flex-col max-sm:justify-center max-sm:gap-1 " +
  "max-sm:rounded-xl max-sm:px-1 max-sm:py-0 max-sm:text-[11px] max-sm:font-semibold max-sm:leading-tight " +
  "max-sm:active:scale-[0.97] max-sm:[&>svg:first-child]:h-5 max-sm:[&>svg:first-child]:w-5";

/** A count on a quick link sits after the label on a pill, and in the corner of a tile. */
export const QUICK_LINK_BADGE = "max-sm:absolute max-sm:right-1 max-sm:top-1";

/** The arrow on a link that opens a menu. A tile does without it. */
export const QUICK_LINK_CHEVRON = "max-sm:hidden";

/** The links' container: a row of pills that wraps, or a grid of tiles on a phone. */
export const QUICK_LINKS_ROW = "grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:gap-3";
