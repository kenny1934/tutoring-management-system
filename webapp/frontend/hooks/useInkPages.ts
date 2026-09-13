"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { PageAnnotations, Stroke } from "./useAnnotations";

/**
 * A page that the lasso's Move button can send selected ink to. The
 * worksheet's pages and the Draft's sheets register themselves while they're
 * showing. The list is kept at the module's level, like the lasso's
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
