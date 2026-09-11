"use client";

import { useRef, useCallback, useEffect } from "react";

/** A single freehand stroke on a page. */
export interface Stroke {
  /** Input points: [x, y, pressure] in page-coordinate space (0..pageWidth, 0..pageHeight). */
  points: [number, number, number][];
  color: string;
  size: number;
  /**
   * "highlighter" for highlighter ink, which is see-through and sits under
   * pen ink. Pen strokes leave it out, and so does every stroke saved before
   * the highlighter existed, so old ink still loads as pen.
   */
  kind?: "highlighter";
}

// How opaque each kind of ink is, on screen and in the saved PDF alike.
const PEN_OPACITY = 0.85;
const HIGHLIGHTER_OPACITY = 0.35;

export const strokeOpacity = (stroke: Pick<Stroke, "kind">) =>
  stroke.kind === "highlighter" ? HIGHLIGHTER_OPACITY : PEN_OPACITY;

export type InkKind = "pen" | "highlighter";

/** A new stroke in the given ink. Pen strokes carry no kind, like ink saved before the highlighter. */
export function makeStroke(points: Stroke["points"], color: string, size: number, ink: InkKind): Stroke {
  return ink === "highlighter" ? { points, color, size, kind: "highlighter" } : { points, color, size };
}

/**
 * A page's strokes split into the two layers they're painted in: highlighter
 * ink first, then pen ink on top of it, each keeping the order it was drawn
 * in. The screen and the saved PDF both paint in this order.
 */
export function inkLayers(strokes: Stroke[]): [highlighter: Stroke[], pen: Stroke[]] {
  const highlighter: Stroke[] = [];
  const pen: Stroke[] = [];
  for (const s of strokes) (s.kind === "highlighter" ? highlighter : pen).push(s);
  return [highlighter, pen];
}

/** Strokes keyed by page index (0-based within the displayed pages). */
export interface PageAnnotations {
  [pageIndex: number]: Stroke[];
}

/**
 * Scale factor for rendering crisp PDF pages.
 * Shared between PdfPageViewer (render) and pdf-annotation-save (export).
 * Annotation coordinates are in CSS pixel space = pdfPoints * RENDER_SCALE.
 */
export const RENDER_SCALE = 1.5;

/** Shared perfect-freehand options for consistent stroke rendering. */
export function getStrokeOptions(stroke: Stroke, isComplete: boolean) {
  // A stroke with exactly two points is a straight line. It comes from the
  // Straight lines tool, or it's a short piece the eraser cut from a longer
  // stroke. Either way it's drawn the same width all the way along. Streamline
  // is off, because it would pull the far end back towards the start while
  // the line is still being dragged.
  if (stroke.points.length === 2) {
    return {
      size: stroke.size,
      thinning: 0,
      smoothing: 0.5,
      streamline: 0,
      simulatePressure: false,
      start: { cap: true, taper: 0 },
      end: { cap: true, taper: 0 },
      last: isComplete,
    };
  }
  // A highlighter keeps the same width all the way along, like a felt tip, so
  // it ignores pressure and doesn't thin out when you move fast.
  if (stroke.kind === "highlighter") {
    return {
      size: stroke.size,
      thinning: 0,
      smoothing: 0.6,
      streamline: 0.6,
      simulatePressure: false,
      start: { cap: true, taper: 0 },
      end: { cap: true, taper: 0 },
      last: isComplete,
    };
  }
  return {
    size: stroke.size,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: stroke.points.every(([, , p]) => p === 0.5),
    start: { cap: true, taper: 0 },
    end: { cap: true, taper: 0 },
    last: isComplete,
  };
}

/**
 * One step in an exercise's undo or redo history. It records what each page it
 * touched held on the other side of the change, so stepping back or forward
 * just puts those strokes back. Drawing a stroke, erasing one and clearing a
 * page each touch one page. Clearing the whole exercise touches every page
 * that had ink, and it's still one step, so one undo brings all of it back.
 */
interface HistoryEntry {
  pages: PageAnnotations;
}

/** True when both lists hold the same stroke objects in the same order. */
function sameStrokes(a: Stroke[], b: Stroke[]): boolean {
  return a.length === b.length && a.every((stroke, i) => stroke === b[i]);
}

/**
 * Strokes restored from sessionStorage come back without any history, so we
 * rebuild one as if they had been drawn a page at a time, in page order. That
 * keeps undo working after a reload, even though the real order is lost.
 */
function historyFromStrokes(annotations: PageAnnotations): HistoryEntry[] {
  const history: HistoryEntry[] = [];
  const pages = Object.keys(annotations).map(Number).sort((a, b) => a - b);
  for (const pageIndex of pages) {
    const strokes = annotations[pageIndex] || [];
    for (let i = 0; i < strokes.length; i++) {
      history.push({ pages: { [pageIndex]: strokes.slice(0, i) } });
    }
  }
  return history;
}

/**
 * Pull the most recent entry off a history stack. When a page is given, only
 * entries that touched that page count, which is how Zen mode undoes on the
 * page you are looking at. Taking an entry out of the middle is safe, because
 * we only ever take that page's part of it. When the entry touched other pages
 * too, as clearing the whole exercise does, the rest of it stays where it was
 * in the stack for those pages.
 */
function takeLatest(stack: HistoryEntry[], pageIndex?: number): HistoryEntry | null {
  if (pageIndex === undefined) return stack.pop() ?? null;
  for (let i = stack.length - 1; i >= 0; i--) {
    const pages = stack[i].pages;
    if (!(pageIndex in pages)) continue;
    const { [pageIndex]: strokes, ...rest } = pages;
    if (Object.keys(rest).length === 0) stack.splice(i, 1);
    else stack[i] = { pages: rest };
    return { pages: { [pageIndex]: strokes } };
  }
  return null;
}

/**
 * In-memory annotation state manager for lesson mode.
 * Annotations are keyed by exercise ID and survive exercise switches.
 * All state is GC'd when the host component unmounts.
 *
 * Each exercise keeps its own undo history in the order you made the changes,
 * across all of its pages, so undo takes back whatever you did last, whether
 * that was drawing a stroke, erasing one, clearing a page or clearing the
 * whole exercise.
 *
 * When sessionKey is provided, annotations are auto-saved to sessionStorage
 * (debounced 500ms) and restored on mount. The history itself is not saved.
 */
export function useAnnotations(sessionKey?: string) {
  const storeRef = useRef<Map<number, PageAnnotations>>(new Map());
  // Undo and redo stacks per exercise, newest entry last.
  const undoRef = useRef<Map<number, HistoryEntry[]>>(new Map());
  const redoRef = useRef<Map<number, HistoryEntry[]>>(new Map());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounced persist to sessionStorage
  const persistToStorage = useCallback(() => {
    if (!sessionKey) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(
          sessionKey,
          JSON.stringify(Object.fromEntries(storeRef.current))
        );
      } catch {}
    }, 500);
  }, [sessionKey]);

  // Restore from sessionStorage on mount
  useEffect(() => {
    if (!sessionKey) return;
    try {
      const saved = sessionStorage.getItem(sessionKey);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      const map = new Map<number, PageAnnotations>();
      const history = new Map<number, HistoryEntry[]>();
      for (const [k, v] of Object.entries(parsed)) {
        const id = Number(k);
        if (!isNaN(id) && typeof v === "object" && v !== null) {
          map.set(id, v as PageAnnotations);
          history.set(id, historyFromStrokes(v as PageAnnotations));
        }
      }
      storeRef.current = map;
      undoRef.current = history;
      redoRef.current = new Map();
    } catch {}
  }, [sessionKey]);

  // Clear save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const getAnnotations = useCallback((exerciseId: number): PageAnnotations => {
    return storeRef.current.get(exerciseId) || {};
  }, []);

  /**
   * Replace a page's strokes as a new change you made. The viewers only
   * report the page that changed, but a page that comes back unchanged is
   * still ignored here, so a caller that reports extra pages can't put empty
   * steps into the history. Any real change also throws away the redo stack,
   * the same as in any drawing app.
   */
  const setPageStrokes = useCallback(
    (exerciseId: number, pageIndex: number, strokes: Stroke[]) => {
      const current = storeRef.current.get(exerciseId) || {};
      const before = current[pageIndex] || [];
      if (sameStrokes(before, strokes)) return;

      storeRef.current.set(exerciseId, { ...current, [pageIndex]: strokes });
      const undo = undoRef.current.get(exerciseId) || [];
      undo.push({ pages: { [pageIndex]: before } });
      undoRef.current.set(exerciseId, undo);
      redoRef.current.delete(exerciseId);
      persistToStorage();
    },
    [persistToStorage]
  );

  /**
   * Move one history entry from one stack to the other: put its strokes back
   * on its pages, and remember what those pages held just before so the
   * opposite action can reverse it. Returns the exercise's annotations
   * afterwards, or null when there was nothing to step through.
   */
  const stepHistory = useCallback(
    (
      from: Map<number, HistoryEntry[]>,
      to: Map<number, HistoryEntry[]>,
      exerciseId: number,
      pageIndex?: number
    ): PageAnnotations | null => {
      const stack = from.get(exerciseId);
      const entry = stack ? takeLatest(stack, pageIndex) : null;
      if (!entry) return null;

      const current = storeRef.current.get(exerciseId) || {};
      const reverse: PageAnnotations = {};
      for (const page of Object.keys(entry.pages).map(Number)) reverse[page] = current[page] || [];
      const opposite = to.get(exerciseId) || [];
      opposite.push({ pages: reverse });
      to.set(exerciseId, opposite);

      const updated = { ...current, ...entry.pages };
      storeRef.current.set(exerciseId, updated);
      persistToStorage();
      return updated;
    },
    [persistToStorage]
  );

  /**
   * Undo the most recent change on an exercise, on whichever page it was.
   * Pass a page index to undo only the most recent change on that page.
   */
  const undo = useCallback(
    (exerciseId: number, pageIndex?: number) =>
      stepHistory(undoRef.current, redoRef.current, exerciseId, pageIndex),
    [stepHistory]
  );

  /** Redo the most recently undone change, optionally limited to one page. */
  const redo = useCallback(
    (exerciseId: number, pageIndex?: number) =>
      stepHistory(redoRef.current, undoRef.current, exerciseId, pageIndex),
    [stepHistory]
  );

  /** Clearing a single page is recorded like any other change, so it can be undone. */
  const clearPage = useCallback(
    (exerciseId: number, pageIndex: number) => {
      setPageStrokes(exerciseId, pageIndex, []);
    },
    [setPageStrokes]
  );

  /**
   * Clear every page of an exercise as a single change, so one undo brings all
   * of its ink back. Nothing is recorded when there's no ink to clear.
   */
  const clearAnnotations = useCallback((exerciseId: number) => {
    const before: PageAnnotations = {};
    for (const [page, strokes] of Object.entries(storeRef.current.get(exerciseId) || {})) {
      if (strokes.length > 0) before[Number(page)] = strokes;
    }
    if (Object.keys(before).length === 0) return;

    storeRef.current.set(exerciseId, {});
    const undo = undoRef.current.get(exerciseId) || [];
    undo.push({ pages: before });
    undoRef.current.set(exerciseId, undo);
    redoRef.current.delete(exerciseId);
    persistToStorage();
  }, [persistToStorage]);

  const clearAll = useCallback(() => {
    storeRef.current.clear();
    undoRef.current.clear();
    redoRef.current.clear();
    persistToStorage();
  }, [persistToStorage]);

  /** Remove sessionStorage entry entirely. */
  const clearStorage = useCallback(() => {
    if (!sessionKey) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    try { sessionStorage.removeItem(sessionKey); } catch {}
  }, [sessionKey]);

  const hasAnnotations = useCallback((exerciseId: number): boolean => {
    const data = storeRef.current.get(exerciseId);
    if (!data) return false;
    return Object.values(data).some((strokes) => strokes.length > 0);
  }, []);

  /** Check if ANY exercise in the store has annotation strokes. */
  const hasAnyAnnotations = useCallback((): boolean => {
    for (const pageAnnotations of storeRef.current.values()) {
      if (Object.values(pageAnnotations).some((s) => s.length > 0)) return true;
    }
    return false;
  }, []);

  /** Return all annotations as a Map (exerciseId → PageAnnotations). */
  const getAllAnnotations = useCallback((): Map<number, PageAnnotations> => {
    return new Map(storeRef.current);
  }, []);

  return {
    getAnnotations,
    getAllAnnotations,
    setPageStrokes,
    undo,
    redo,
    clearPage,
    clearAnnotations,
    clearAll,
    clearStorage,
    hasAnnotations,
    hasAnyAnnotations,
  };
}
