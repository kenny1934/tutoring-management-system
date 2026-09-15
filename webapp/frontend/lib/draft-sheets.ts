import { DRAFT_PAGE_BASE, RENDER_SCALE, type PageAnnotations } from "@/hooks/useAnnotations";
import { createBooleanPreference } from "./boolean-preference";
import { MAX_ZOOM, MIN_ZOOM } from "./zoom";

// The page index the Draft's sheets start at. The ink hook defines it, because
// saving ink to the server needs it too, and it's re-exported here for the Draft.
export { DRAFT_PAGE_BASE };

/** A Draft sheet is A4 portrait, the size nearly every worksheet is, in PDF points. */
export const DRAFT_SHEET_PT = { width: 595.28, height: 841.89 };

/** The same sheet in page units, which are what strokes are drawn in. */
export const DRAFT_SHEET = {
  width: DRAFT_SHEET_PT.width * RENDER_SCALE,
  height: DRAFT_SHEET_PT.height * RENDER_SCALE,
};

/**
 * Squared paper has one-centimetre squares, in PDF points. That's twice the
 * size of an exercise book's, because writing done with a finger on a board
 * is big.
 */
export const DRAFT_SQUARE_PT = 72 / 2.54;

/** The same square in page units, which is how far apart the corners that lines snap to are. */
export const DRAFT_SQUARE = DRAFT_SQUARE_PT * RENDER_SCALE;

/** The colour of the squares' lines, on screen and in the saved PDF. */
export const DRAFT_GRID_COLOUR = { css: "#c9d6e6", rgb: [0xc9 / 255, 0xd6 / 255, 0xe6 / 255] as const };

/** Whether the Draft is squared or blank. It's one switch, remembered per browser. */
export const draftSquared = createBooleanPreference("csm_draft_squared");

/**
 * The zoom the Draft's sheets are shown at, remembered per browser like the
 * paper. "fit" follows the pane's width as the pane changes size, and a number
 * is a zoom the tutor chose, as a percentage.
 */
export type DraftZoom = "fit" | number;
const DRAFT_ZOOM_KEY = "csm_draft_zoom";

/** The Draft's remembered zoom. Anything this code wouldn't have saved reads as "fit". */
export function readDraftZoom(): DraftZoom {
  try {
    const saved = Number(localStorage.getItem(DRAFT_ZOOM_KEY));
    return Number.isInteger(saved) && saved >= MIN_ZOOM && saved <= MAX_ZOOM ? saved : "fit";
  } catch {
    return "fit";
  }
}

export function saveDraftZoom(zoom: DraftZoom) {
  try { localStorage.setItem(DRAFT_ZOOM_KEY, String(zoom)); } catch { /* private window */ }
}

const isDraftPage = (pageIndex: number) => pageIndex >= DRAFT_PAGE_BASE;

/** The Draft pages that have ink on them, in sheet order. */
export function inkedDraftPages(annotations: PageAnnotations): number[] {
  return Object.keys(annotations)
    .map(Number)
    .filter((page) => isDraftPage(page) && annotations[page].length > 0)
    .sort((a, b) => a - b);
}

/** How many sheets it takes to reach the last one with ink, or 0 when the Draft is empty. */
export function draftSheetsInUse(annotations: PageAnnotations): number {
  const pages = inkedDraftPages(annotations);
  return pages.length ? pages[pages.length - 1] - DRAFT_PAGE_BASE + 1 : 0;
}
