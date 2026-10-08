"use client";

import type { CSSProperties } from "react";
import { size } from "@floating-ui/react";
import { useIsMobile } from "@/hooks/useIsMobile";

/**
 * Floating UI middleware that keeps a popover inside the screen. It measures
 * the room left between the anchor and the edge of the screen on the side the
 * popover opened, and caps the popover's height at that, so anything longer
 * scrolls inside it instead of running off the top or bottom. Put it after
 * flip and shift, so it measures the side the popover actually ends up on.
 * The floor of 120px stops a popover squeezed against an edge from becoming
 * a sliver; flip has usually moved it to the roomier side by then. A list
 * that should stay short even on a tall screen passes its own cap in pixels.
 */
export function fitToScreen(padding = 8, cap = Infinity) {
  return size({
    padding,
    apply({ availableHeight, elements }) {
      Object.assign(elements.floating.style, {
        maxHeight: `${Math.min(Math.max(availableHeight, 120), cap)}px`,
        overflowY: "auto",
      });
    },
  });
}

/**
 * The classes a popover takes when it is drawn as a sheet. The bottom padding
 * assumes the popover pads its content by 1rem, as most of them do, and adds
 * room for a phone's home bar.
 */
const SHEET_CLASS =
  "w-full rounded-t-2xl rounded-b-none border-x-0 border-b-0 max-h-[85dvh] overflow-y-auto overscroll-contain pb-[calc(1rem+env(safe-area-inset-bottom))] animate-drawer-in";

/**
 * On a phone, a popover that shows the details of something tapped becomes a
 * sheet along the bottom of the screen. A popover pinned to the tap can run
 * past the top or bottom of a short screen, while the sheet always has most
 * of the screen to scroll in and keeps its buttons near the thumb.
 *
 * This answers whether to draw the sheet. Call it before useFloating, so the
 * popover can leave fitToScreen out when it is a sheet: the sheet sets its own
 * height, and fitToScreen would replace it with the room around the tap.
 *
 * The width is read straight from the window, because these popovers only
 * render once someone has tapped something, and the hook's first answer is
 * always "not a phone". The hook is still there so turning the phone or
 * resizing the window redraws the popover.
 */
export function useAsSheet(): boolean {
  const isMobile = useIsMobile();
  return typeof window !== "undefined" ? window.innerWidth < 768 : isMobile;
}

/**
 * What a popover needs to draw itself as a sheet, or as itself.
 *
 * It keeps its floating ref either way, so a tap outside still closes it, and
 * the sheet's backdrop counts as outside.
 *
 * The sheet sets its position inline, like a popover does, because classes
 * such as paper-texture set position: relative and would beat a Tailwind
 * class. Callers should also leave paper-texture off the sheet, because its
 * overlay only covers the first screenful of a box that scrolls.
 */
export function sheetParts(asSheet: boolean, floatingStyles: CSSProperties, zIndex = 9999) {
  const style: CSSProperties = asSheet
    ? { position: "fixed", left: 0, right: 0, bottom: 0, zIndex }
    : { ...floatingStyles, zIndex };

  const backdrop = asSheet ? (
    <div className="fixed inset-0 bg-black/40 animate-backdrop-in" style={{ zIndex }} aria-hidden="true" />
  ) : null;

  const handle = asSheet ? (
    <div className="-mt-1 mb-2 flex justify-center" aria-hidden="true">
      <div className="h-1 w-10 rounded-full bg-ink-subtle/40" />
    </div>
  ) : null;

  return { asSheet, style, sheetClass: SHEET_CLASS, backdrop, handle };
}
