"use client";

import { useRef, useCallback, useEffect } from "react";

/** A single freehand stroke on a page. */
export interface Stroke {
  /** Input points: [x, y, pressure] in page-coordinate space (0..pageWidth, 0..pageHeight). */
  points: [number, number, number][];
  color: string;
  size: number;
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
 * In-memory annotation state manager for lesson mode.
 * Annotations are keyed by exercise ID and survive exercise switches.
 * All state is GC'd when the host component unmounts.
 *
 * When sessionKey is provided, annotations are auto-saved to sessionStorage
 * (debounced 500ms) and restored on mount.
 */
export function useAnnotations(sessionKey?: string) {
  const storeRef = useRef<Map<number, PageAnnotations>>(new Map());
  // Redo stack: exerciseId → pageIndex → array of undone strokes
  const redoRef = useRef<Map<number, Record<number, Stroke[]>>>(new Map());
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
      for (const [k, v] of Object.entries(parsed)) {
        const id = Number(k);
        if (!isNaN(id) && typeof v === "object" && v !== null) {
          map.set(id, v as PageAnnotations);
        }
      }
      storeRef.current = map;
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

  const setPageStrokes = useCallback(
    (exerciseId: number, pageIndex: number, strokes: Stroke[]) => {
      const current = storeRef.current.get(exerciseId) || {};
      storeRef.current.set(exerciseId, { ...current, [pageIndex]: strokes });
      // Clear redo stack for this page when a new stroke is drawn
      const redo = redoRef.current.get(exerciseId);
      if (redo?.[pageIndex]) {
        delete redo[pageIndex];
      }
      persistToStorage();
    },
    [persistToStorage]
  );

  const undoLastStroke = useCallback(
    (exerciseId: number, pageIndex: number): Stroke[] => {
      const current = storeRef.current.get(exerciseId) || {};
      const pageStrokes = current[pageIndex] || [];
      if (pageStrokes.length === 0) return pageStrokes;

      // Push removed stroke onto redo stack
      const removed = pageStrokes[pageStrokes.length - 1];
      const redo = redoRef.current.get(exerciseId) || {};
      redo[pageIndex] = [...(redo[pageIndex] || []), removed];
      redoRef.current.set(exerciseId, redo);

      const updated = pageStrokes.slice(0, -1);
      storeRef.current.set(exerciseId, { ...current, [pageIndex]: updated });
      persistToStorage();
      return updated;
    },
    [persistToStorage]
  );

  const redoLastStroke = useCallback(
    (exerciseId: number, pageIndex: number): Stroke[] | null => {
      const redo = redoRef.current.get(exerciseId);
      const redoStrokes = redo?.[pageIndex];
      if (!redoStrokes || redoStrokes.length === 0) return null;

      // Pop last undone stroke and add back
      const stroke = redoStrokes.pop()!;
      const current = storeRef.current.get(exerciseId) || {};
      const pageStrokes = [...(current[pageIndex] || []), stroke];
      storeRef.current.set(exerciseId, { ...current, [pageIndex]: pageStrokes });
      persistToStorage();
      return pageStrokes;
    },
    [persistToStorage]
  );

  const clearPage = useCallback(
    (exerciseId: number, pageIndex: number) => {
      const current = storeRef.current.get(exerciseId) || {};
      const { [pageIndex]: _, ...rest } = current;
      storeRef.current.set(exerciseId, rest);
      // Clear redo for this page
      const redo = redoRef.current.get(exerciseId);
      if (redo?.[pageIndex]) delete redo[pageIndex];
      persistToStorage();
    },
    [persistToStorage]
  );

  const clearAnnotations = useCallback((exerciseId: number) => {
    storeRef.current.delete(exerciseId);
    redoRef.current.delete(exerciseId);
    persistToStorage();
  }, [persistToStorage]);

  const clearAll = useCallback(() => {
    storeRef.current.clear();
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
    undoLastStroke,
    redoLastStroke,
    clearPage,
    clearAnnotations,
    clearAll,
    clearStorage,
    hasAnnotations,
    hasAnyAnnotations,
  };
}
