"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ERASER_RADIUS, type EraserSetting } from "@/lib/stroke-eraser";
import { INK, type InkKind } from "./useAnnotations";

/**
 * Which tool the lesson viewer's Pen Tray has picked. The Hand scrolls the
 * worksheet and draws nothing, so it is where every lesson starts. Fading ink
 * is for pointing: its marks fade away by themselves and are never saved. The
 * lasso selects ink, to move it, resize it or delete it.
 */
type AnnotationTool = "hand" | InkKind | "eraser" | "fade" | "lasso";

const isInk = (tool: AnnotationTool): tool is InkKind => tool in INK;

export type InkSize = "S" | "M" | "L";

/** One colour on the tray. Each pen and highlighter colour is its own swatch. */
export interface InkSwatch {
  id: string;
  kind: InkKind;
  color: string;
  label: string;
}

export const INK_SWATCHES: InkSwatch[] = [
  { id: "red", kind: "pen", color: "#dc2626", label: "Red pen" },
  { id: "blue", kind: "pen", color: "#2563eb", label: "Blue pen" },
  { id: "black", kind: "pen", color: "#000000", label: "Black pen" },
  // A pencil, for construction lines. It's mid grey, so it still shows clearly on a projected board.
  { id: "grey", kind: "pencil", color: "#6b7280", label: "Grey pencil" },
  { id: "yellow", kind: "highlighter", color: "#facc15", label: "Yellow highlighter" },
  { id: "green", kind: "highlighter", color: "#4ade80", label: "Green highlighter" },
  { id: "pink", kind: "highlighter", color: "#f472b6", label: "Pink highlighter" },
];

/**
 * Stroke widths in page units, which are the PDF's points times the viewer's
 * render scale. The pen widths are the ones the old toolbar offered. A pencil
 * line keeps its width all the way along, so it's set a little finer than a
 * pen, which swells and thins. A medium highlighter is about as tall as a line
 * of worksheet text.
 */
export const INK_SIZES: Record<InkKind, Record<InkSize, number>> = {
  pen: { S: 3, M: 6, L: 12 },
  pencil: { S: 2.5, M: 4, L: 7 },
  highlighter: { S: 12, M: 20, L: 30 },
};

// Every swatch needs a size here, or its strokes would have no width.
const DEFAULT_SIZES: Record<string, InkSize> = {
  red: "S", blue: "S", black: "S", grey: "S", yellow: "M", green: "M", pink: "M",
};

// The sizes, last colour and eraser are remembered per browser, so the board
// in each classroom keeps its own setup. The tool itself always starts at the
// Hand, so opening an exercise never draws by accident.
const STORAGE_KEY = "csm_annotation_tools";

interface StoredTools {
  swatchId: string;
  sizes: Record<string, InkSize>;
  eraser: EraserSetting;
}

const isSize = (v: unknown): v is InkSize => v === "S" || v === "M" || v === "L";
const isEraser = (v: unknown): v is EraserSetting =>
  v === "stroke" || (typeof v === "string" && Object.keys(ERASER_RADIUS).includes(v));
const findSwatch = (id: string) => INK_SWATCHES.find((s) => s.id === id);

function readStored(): StoredTools {
  const fallback: StoredTools = { swatchId: "red", sizes: { ...DEFAULT_SIZES }, eraser: "M" };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw || typeof raw !== "object") return fallback;
    const sizes = { ...DEFAULT_SIZES };
    for (const [id, size] of Object.entries(raw.sizes ?? {})) {
      if (findSwatch(id) && isSize(size)) sizes[id] = size;
    }
    return {
      swatchId: findSwatch(raw.swatchId) ? raw.swatchId : fallback.swatchId,
      sizes,
      eraser: isEraser(raw.eraser) ? raw.eraser : fallback.eraser,
    };
  } catch {
    return fallback;
  }
}

/**
 * The Pen Tray's settings, shared by both lesson views: the tool, whether
 * straight lines are on, the colour you last picked, each colour's size and
 * the eraser size. The lesson views also pass in whether the lessons' saved
 * ink has loaded, so the drawing layers can wait for it.
 */
export function useAnnotationTools({ inkReady = true }: { inkReady?: boolean } = {}) {
  const [stored] = useState(readStored);
  // Straight lines is a switch on the pens, the pencil and the highlighters, so it's kept with
  // the tool. Picking the Hand, the eraser, fading ink or the lasso turns it
  // off, so the next colour you pick always starts out freehand.
  const [{ tool, straight }, setMode] = useState<{ tool: AnnotationTool; straight: boolean }>(
    { tool: "hand", straight: false },
  );
  const [swatchId, setSwatchId] = useState(stored.swatchId);
  const [sizes, setSizes] = useState(stored.sizes);
  const [eraser, setEraser] = useState<EraserSetting>(stored.eraser);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ swatchId, sizes, eraser }));
    } catch { /* private window or storage full */ }
  }, [swatchId, sizes, eraser]);

  const swatch = findSwatch(swatchId) ?? INK_SWATCHES[0];

  const selectHand = useCallback(() => setMode({ tool: "hand", straight: false }), []);
  const selectEraser = useCallback(() => setMode({ tool: "eraser", straight: false }), []);
  const selectFade = useCallback(() => setMode({ tool: "fade", straight: false }), []);
  const selectLasso = useCallback(() => setMode({ tool: "lasso", straight: false }), []);

  // Changing colour keeps straight lines on, so you can rule lines in several colours.
  const selectSwatch = useCallback((id: string) => {
    const next = findSwatch(id);
    if (!next) return;
    setSwatchId(id);
    setMode((m) => ({ tool: next.kind, straight: isInk(m.tool) && m.straight }));
  }, []);

  /**
   * The Straight lines button. With a pen or highlighter picked, it switches
   * straight lines on or off. With anything else picked, it goes back to the
   * colour you used last with straight lines on.
   */
  const toggleStraight = useCallback(() => {
    setMode((m) => (isInk(m.tool) ? { ...m, straight: !m.straight } : { tool: swatch.kind, straight: true }));
  }, [swatch.kind]);

  const setSwatchSize = useCallback((id: string, size: InkSize) => {
    setSizes((prev) => ({ ...prev, [id]: size }));
  }, []);

  /**
   * The D, E and L keys. D picks the pen or highlighter you used last, E the
   * eraser and L the lasso. Pressing the key for the tool you're already
   * using puts it down and goes back to the Hand.
   */
  const toggleFromKey = useCallback((key: "pen" | "eraser" | "lasso") => {
    setMode((m) => {
      if (key !== "pen") return { tool: m.tool === key ? "hand" : key, straight: false };
      if (isInk(m.tool)) return { tool: "hand", straight: false };
      return { tool: swatch.kind, straight: false };
    });
  }, [swatch.kind]);

  return useMemo(() => ({
    tool,
    /** True when the picked pen or highlighter draws straight lines. */
    straight,
    /** True when fading ink is picked. */
    fading: tool === "fade",
    /** The colour you picked last. A new stroke gets its colour and kind whenever a pen or highlighter is picked. */
    swatch,
    sizes,
    eraser,
    /** True whenever a tool other than the Hand is picked. */
    drawingEnabled: tool !== "hand",
    /** The width of a new stroke in the picked colour. */
    inkSize: INK_SIZES[swatch.kind][sizes[swatch.id]],
    /** How far the rubbing eraser reaches, or null for the whole-stroke eraser. */
    eraserRadius: eraser === "stroke" ? null : ERASER_RADIUS[eraser],
    /** False until the lessons' saved ink has loaded. Nothing draws before then. */
    inkReady,
    selectHand,
    selectEraser,
    selectFade,
    selectLasso,
    selectSwatch,
    toggleStraight,
    setSwatchSize,
    setEraser,
    toggleFromKey,
  }), [
    tool, straight, swatch, sizes, eraser, inkReady,
    selectHand, selectEraser, selectFade, selectLasso, selectSwatch, toggleStraight, setSwatchSize, toggleFromKey,
  ]);
}

export type AnnotationTools = ReturnType<typeof useAnnotationTools>;

/**
 * The Pen Tray's settings as a drawing layer's props. The worksheet's pages
 * and the Draft's sheets both draw with them, so a new tool setting only has
 * to be passed on here.
 */
export function inkLayerProps(tools: AnnotationTools) {
  const erasing = tools.tool === "eraser";
  const selecting = tools.tool === "lasso";
  return {
    isDrawing: tools.drawingEnabled && !erasing && !selecting,
    isErasing: erasing,
    isSelecting: selecting,
    eraserRadius: tools.eraserRadius,
    penColor: tools.swatch.color,
    penSize: tools.inkSize,
    inkKind: tools.swatch.kind,
    straight: tools.straight,
    fading: tools.fading,
    inkReady: tools.inkReady,
  };
}
