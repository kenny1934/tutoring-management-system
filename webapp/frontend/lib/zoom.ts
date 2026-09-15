import type { CSSProperties } from "react";

/**
 * Zoom for a pane of pages, such as the worksheet or the Draft's sheets. A
 * zoom is a percentage of the pages' natural size, and the buttons on a
 * pane's bar step it by a quarter.
 */
export const MIN_ZOOM = 25;
export const MAX_ZOOM = 200;
export const ZOOM_STEP = 25;

/**
 * The zoom that fits a page of this width across a scroller, inside its side
 * padding, and never past the most a pane zooms.
 */
export function computeFitZoom(container: HTMLElement, pageWidth: number): number {
  const style = getComputedStyle(container);
  const paddingX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const containerWidth = container.clientWidth - paddingX;
  const rawZoom = Math.floor((containerWidth / pageWidth) * 100);
  return Math.min(rawZoom, MAX_ZOOM);
}

/**
 * Every style that follows the zoom level, for a stack of pages inside a
 * scroller. The stack is laid out at the pages' natural size and scaled from
 * its top-left corner, and its width is set so that, once it's scaled, it
 * fills the scroller's width. Its bottom margin makes up the difference
 * between the height it's laid out at and the height it's drawn at, so
 * whatever comes after it, such as the room left for the Pen Tray, starts
 * where the pages end on screen. Past fit-to-width the pages line up on the
 * left, and the scroller lets them scroll sideways.
 */
export function stackZoomStyles(
  zoom: number,
  fitZoom: number,
  naturalHeight: number,
): { stack: CSSProperties; scroller: CSSProperties } {
  const scale = zoom / 100;
  const pastFit = zoom > fitZoom;
  return {
    stack: {
      transform: `scale(${scale})`,
      width: `${(100 / zoom) * 100}%`,
      marginBottom: scale === 1 ? "" : `${naturalHeight * (scale - 1)}px`,
      alignItems: pastFit ? "flex-start" : "center",
    },
    scroller: { overflowX: pastFit ? "auto" : "hidden" },
  };
}
