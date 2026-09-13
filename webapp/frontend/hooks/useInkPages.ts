"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { PageAnnotations, Stroke } from "./useAnnotations";
import type { Vec } from "@/lib/stroke-select";

/**
 * A line that a tool draws on a page by itself, such as an arc the compasses
 * draw as they turn. The tool gives the line's points in screen pixels, and
 * the page draws them in the picked ink until the tool ends the line.
 */
export interface DrivenLine {
  to: (points: Vec[]) => void;
  end: () => void;
}

/**
 * A page that the lasso's Move button can send selected ink to, and that the
 * compasses draw on and snap to. The worksheet's pages and the Draft's sheets
 * register themselves while they're showing. The list is kept at the module's
 * level, like the lasso's
 * one-selection signal, because the worksheet and the Draft are separate
 * panes that share nothing else a drawing layer can reach.
 */
export interface InkPage {
  /** The page's index in the exercise's annotations. The Draft's sheets start at DRAFT_PAGE_BASE. */
  index: number;
  /** What the Move list calls it, such as "Page 3" or "Draft sheet 2". */
  label: string;
  /** The page's size in page units. Ink moved onto it is kept inside it. */
  width: number;
  height: number;
  /**
   * How the page's ink is saved. Pages are only offered to each other when
   * they share it, which keeps the list to the exercise on screen.
   */
  onPagesChange: (pages: PageAnnotations) => void;
  /** The page's strokes as they are now. */
  strokes: () => Stroke[];
  /** Selects ink that has just been moved onto the page, and scrolls it into view. */
  receive: (strokes: Stroke[]) => void;
  /** Whether a point on screen is on the page. */
  contains: (point: Vec) => boolean;
  /**
   * Starts a line a tool drives, from this point on screen. It returns null
   * while the page can't take ink: before the lessons' saved ink has loaded,
   * while two fingers are scrolling it, or while another line is being drawn.
   */
  startLine: (start: Vec) => DrivenLine | null;
  /** The point in the page's pen ink that a tool snaps onto, within reach of a point on screen, in screen pixels. */
  snapNear: (point: Vec, reach: number) => Vec | null;
}

const pages = new Map<string, InkPage>();
const listeners = new Set<() => void>();
// The pages in order, rebuilt only when one comes or goes, so every reader gets the same array until then.
let inOrder: InkPage[] = [];

function announce() {
  inOrder = [...pages.values()].sort((a, b) => a.index - b.index);
  listeners.forEach((listen) => listen());
}

/** Put a drawing layer's page on the list while it's showing. It returns the way to take it off again. */
export function registerInkPage(id: string, page: InkPage): () => void {
  pages.set(id, page);
  announce();
  return () => {
    pages.delete(id);
    announce();
  };
}

const subscribe = (listen: () => void) => {
  listeners.add(listen);
  return () => {
    listeners.delete(listen);
  };
};
const readPages = () => inOrder;

/** The page under a point on screen, if any, such as the one under the compasses' pencil. */
export function inkPageAt(point: Vec): InkPage | undefined {
  return inOrder.find((page) => page.contains(point));
}

/** The point in the ink of the page under a point on screen that a tool snaps onto, within reach of it, or null. */
export function inkSnapAt(point: Vec, reach: number): Vec | null {
  return inkPageAt(point)?.snapNear(point, reach) ?? null;
}

/**
 * The other pages that ink on the given page can be moved to, in page order.
 * A page with no place among the exercise's pages, such as one outside the
 * lesson views, gets none.
 */
export function useMoveTargets(from: number | undefined, onPagesChange: InkPage["onPagesChange"] | undefined): InkPage[] {
  const all = useSyncExternalStore(subscribe, readPages, readPages);
  return useMemo(
    () => (from === undefined || !onPagesChange ? [] : all.filter((page) => page.onPagesChange === onPagesChange && page.index !== from)),
    [all, from, onPagesChange],
  );
}
