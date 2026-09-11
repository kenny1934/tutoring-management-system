"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ERASER_RADIUS, type EraserSetting } from "@/lib/stroke-eraser";
import type { InkKind } from "./useAnnotations";

/**
 * Which tool the lesson viewer's Pen Tray has picked. The Hand scrolls the
 * worksheet and draws nothing, so it is where every lesson starts.
 */
type AnnotationTool = "hand" | InkKind | "eraser";

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
  { id: "yellow", kind: "highlighter", color: "#facc15", label: "Yellow highlighter" },
  { id: "green", kind: "highlighter", color: "#4ade80", label: "Green highlighter" },
  { id: "pink", kind: "highlighter", color: "#f472b6", label: "Pink highlighter" },
];

/**
 * Stroke widths in page units, which are the PDF's points times the viewer's
 * render scale. The pen widths are the ones the old toolbar offered. A medium
 * highlighter is about as tall as a line of worksheet text.
 */
export const INK_SIZES: Record<InkKind, Record<InkSize, number>> = {
  pen: { S: 3, M: 6, L: 12 },
  highlighter: { S: 12, M: 20, L: 30 },
};

const DEFAULT_SIZES: Record<string, InkSize> = {
  red: "S", blue: "S", black: "S", yellow: "M", green: "M", pink: "M",
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
 * The Pen Tray's settings, shared by both lesson views: the tool, the colour
 * you last picked, each colour's size and the eraser size.
 */
export function useAnnotationTools() {
  const [stored] = useState(readStored);
  const [tool, setTool] = useState<AnnotationTool>("hand");
  const [swatchId, setSwatchId] = useState(stored.swatchId);
  const [sizes, setSizes] = useState(stored.sizes);
  const [eraser, setEraser] = useState<EraserSetting>(stored.eraser);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ swatchId, sizes, eraser }));
    } catch { /* private window or storage full */ }
  }, [swatchId, sizes, eraser]);

  const swatch = findSwatch(swatchId) ?? INK_SWATCHES[0];

  const selectHand = useCallback(() => setTool("hand"), []);
  const selectEraser = useCallback(() => setTool("eraser"), []);

  const selectSwatch = useCallback((id: string) => {
    const next = findSwatch(id);
    if (!next) return;
    setSwatchId(id);
    setTool(next.kind);
  }, []);

  const setSwatchSize = useCallback((id: string, size: InkSize) => {
    setSizes((prev) => ({ ...prev, [id]: size }));
  }, []);

  /**
   * The D and E keys. D picks the pen or highlighter you used last, and E the
   * eraser. Pressing the key for the tool you're already using puts it down
   * and goes back to the Hand.
   */
  const toggleFromKey = useCallback((key: "pen" | "eraser") => {
    setTool((current) => {
      if (key === "eraser") return current === "eraser" ? "hand" : "eraser";
      if (current === "pen" || current === "highlighter") return "hand";
      return swatch.kind;
    });
  }, [swatch.kind]);

  return useMemo(() => ({
    tool,
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
    selectHand,
    selectEraser,
    selectSwatch,
    setSwatchSize,
    setEraser,
    toggleFromKey,
  }), [tool, swatch, sizes, eraser, selectHand, selectEraser, selectSwatch, setSwatchSize, toggleFromKey]);
}

export type AnnotationTools = ReturnType<typeof useAnnotationTools>;
