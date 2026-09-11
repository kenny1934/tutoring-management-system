import { RENDER_SCALE, type PageAnnotations } from "@/hooks/useAnnotations";
import { createBooleanPreference } from "./boolean-preference";

/**
 * The Draft is blank or squared paper beside the worksheet, for the tutor's
 * working. Its ink lives in the exercise's own annotations as extra pages,
 * starting at this page index, so sheet one is page 1000. No worksheet shows
 * anywhere near a thousand pages, so the two never collide. That also means
 * undo, clearing, the exit warnings and saving all treat Draft ink like any
 * other ink without knowing the Draft exists.
 */
export const DRAFT_PAGE_BASE = 1000;

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

/** The colour of the squares' lines, on screen and in the saved PDF. */
export const DRAFT_GRID_COLOUR = { css: "#c9d6e6", rgb: [0.79, 0.84, 0.9] as const };

/** Whether the Draft is squared or blank. It's one switch, remembered per browser. */
export const draftSquared = createBooleanPreference("csm_draft_squared");

export const isDraftPage = (pageIndex: number) => pageIndex >= DRAFT_PAGE_BASE;

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
