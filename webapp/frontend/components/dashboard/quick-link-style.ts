/**
 * How the dashboard's quick links look. Four of them live in the header and
 * three in their own components (Make-up, Trials and Leave), so they share
 * these classes to stay alike.
 *
 * From 640px up a quick link is a pill, and the links wrap along a line. On a
 * phone a pill per link wrapped into four rows and pushed today's lessons off
 * the first screen, so there each link becomes a small tile instead: the icon
 * over a short label, any count in the tile's corner, and no arrow, since
 * every tile opens something when tapped. The tiles sit in one row that
 * scrolls sideways, in the same order as on a wider screen so they're where
 * people's thumbs expect them, with the fifth peeking in under a fade at the
 * edge (see useScrollFade) so it's clear there are more. Each link keeps its
 * own background colour.
 */
export const QUICK_LINK =
  "inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-medium transition-all " +
  "border border-line-strong text-accent-ink hover:bg-tint hover:shadow-sm " +
  "max-sm:relative max-sm:h-14 max-sm:w-full max-sm:flex-col max-sm:justify-center max-sm:gap-1 " +
  "max-sm:rounded-xl max-sm:px-1 max-sm:py-0 max-sm:text-[11px] max-sm:font-semibold max-sm:leading-tight " +
  "max-sm:active:scale-[0.97] max-sm:[&>svg:first-child]:h-5 max-sm:[&>svg:first-child]:w-5";

/** A count on a quick link sits after the label on a pill, and in the corner of a tile. */
export const QUICK_LINK_BADGE = "max-sm:absolute max-sm:right-1 max-sm:top-1";

/** The arrow on a link that opens a menu. A tile does without it. */
export const QUICK_LINK_CHEVRON = "max-sm:hidden";

/**
 * The links' container: a row of pills that wraps, or on a phone a row of
 * tiles that scrolls sideways. There it reaches the card's edges, so a tile
 * scrolls out of view under the edge rather than stopping short of it.
 */
export const QUICK_LINKS_ROW =
  "flex gap-2 max-sm:-mx-4 max-sm:px-4 max-sm:overflow-x-auto max-sm:snap-x max-sm:scroll-px-4 scrollbar-hide sm:flex-wrap sm:gap-3";

/** What holds each link: on a phone a tile 70px wide, so four fit with about 30px of the fifth peeking in. */
export const QUICK_LINK_CELL = "max-sm:w-[70px] max-sm:shrink-0 max-sm:snap-start";
