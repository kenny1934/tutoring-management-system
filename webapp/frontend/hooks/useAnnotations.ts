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

/** How opaque each kind of ink is, on screen and in the saved PDF alike. */
export const PEN_OPACITY = 0.85;
export const HIGHLIGHTER_OPACITY = 0.35;

export const strokeOpacity = (stroke: Pick<Stroke, "kind">) =>
  stroke.kind === "highlighter" ? HIGHLIGHTER_OPACITY : PEN_OPACITY;

/**
 * A page's strokes in the order they're painted: every highlighter stroke,
 * then every pen stroke, each group keeping the order it was drawn in. That
 * keeps pen ink on top of highlighter ink, on screen and in the saved PDF.
 */
export function inkOrder(strokes: Stroke[]): Stroke[] {
  return [
    ...strokes.filter((s) => s.kind === "highlighter"),
    ...strokes.filter((s) => s.kind !== "highlighter"),
  ];
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
 * One step in an exercise's undo or redo history. It records which page
 * changed and what that page held on the other side of the change, so
 * stepping back or forward just puts those strokes back on the page. Drawing
 * a stroke, erasing one and clearing a page are all recorded the same way.
 */
interface HistoryEntry {
  pageIndex: number;
  strokes: Stroke[];
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
      history.push({ pageIndex, strokes: strokes.slice(0, i) });
    }
  }
  return history;
}

/**
 * Pull the most recent entry off a history stack. When a page is given, only
 * entries for that page count, which is how Zen mode undoes on the page you
 * are looking at. Taking an entry out of the middle is safe, because each
 * page's entries only ever describe that page.
 */
function takeLatest(stack: HistoryEntry[], pageIndex?: number): HistoryEntry | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (pageIndex === undefined || stack[i].pageIndex === pageIndex) {
      return stack.splice(i, 1)[0];
    }
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
 * that was drawing a stroke, erasing one or clearing a page.
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
      undo.push({ pageIndex, strokes: before });
      undoRef.current.set(exerciseId, undo);
      redoRef.current.delete(exerciseId);
      persistToStorage();
    },
    [persistToStorage]
  );

  /**
   * Move one history entry from one stack to the other: put its strokes back
   * on its page, and remember what the page held just before so the opposite
   * action can reverse it. Returns the exercise's annotations afterwards, or
   * null when there was nothing to step through.
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
      const opposite = to.get(exerciseId) || [];
      opposite.push({ pageIndex: entry.pageIndex, strokes: current[entry.pageIndex] || [] });
      to.set(exerciseId, opposite);

      const updated = { ...current, [entry.pageIndex]: entry.strokes };
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

  // Clearing a whole exercise is confirmed in the viewer first, and it wipes
  // the history too, so it cannot be undone.
  const clearAnnotations = useCallback((exerciseId: number) => {
    storeRef.current.delete(exerciseId);
    undoRef.current.delete(exerciseId);
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
