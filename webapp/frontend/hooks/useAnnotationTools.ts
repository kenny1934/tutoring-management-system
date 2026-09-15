"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ERASER_RADIUS, type EraserSetting } from "@/lib/stroke-eraser";
import { CM } from "@/lib/drawing-guide";
import type { TextPart } from "@/lib/text-ink";
import type { PenKind } from "./useAnnotations";

/**
 * Which tool the lesson viewer's Pen Tray has picked. The Hand scrolls the
 * worksheet and draws nothing, so it is where every lesson starts. Fading ink
 * is for pointing: its marks fade away by themselves and are never saved. The
 * lasso selects ink, to move it, resize it or delete it. The Text tool types
 * text onto the page.
 */
type AnnotationTool = "hand" | PenKind | "eraser" | "fade" | "lasso" | "text";

const isInk = (tool: AnnotationTool): tool is PenKind => tool in INK_SIZES;

export type InkSize = "S" | "M" | "L";

/** One colour on the tray. Each pen and highlighter colour is its own swatch. */
export interface InkSwatch {
  id: string;
  kind: PenKind;
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

/** The colours text comes in: the pens' and the pencil's. Highlighter colours are too pale to read as writing. */
export const TEXT_SWATCHES = INK_SWATCHES.filter((s) => s.kind === "pen" || s.kind === "pencil");

/** What a text colour's button is called, such as "Red text". */
export const textColourName = (swatch: InkSwatch) => `${swatch.label.split(" ")[0]} text`;

const findTextSwatch = (id: unknown) => TEXT_SWATCHES.find((s) => s.id === id);
// Text has a colour of its own, apart from the pens, and starts black, the way a worksheet is printed.
const TEXT_BLACK = findTextSwatch("black")!;

/**
 * The Text tool's sizes, which are the height of a Chinese character, in page
 * units. Placed proof reasons are written at the same size.
 */
export const TEXT_SIZES: Record<InkSize, number> = { S: 0.5 * CM, M: 0.7 * CM, L: 1 * CM };

/**
 * Stroke widths in page units, which are the PDF's points times the viewer's
 * render scale. The pen widths are the ones the old toolbar offered. A pencil
 * line keeps its width all the way along, so it's set a little finer than a
 * pen, which swells and thins. A medium highlighter is about as tall as a line
 * of worksheet text.
 */
export const INK_SIZES: Record<PenKind, Record<InkSize, number>> = {
  pen: { S: 3, M: 6, L: 12 },
  pencil: { S: 2.5, M: 4, L: 7 },
  highlighter: { S: 12, M: 20, L: 30 },
};

// Every swatch needs a size here, or its strokes would have no width.
const DEFAULT_SIZES: Record<string, InkSize> = {
  red: "S", blue: "S", black: "S", grey: "S", yellow: "M", green: "M", pink: "M",
};

// The sizes, last colour, eraser, and the text's size and colour are
// remembered per browser, so each tutor's laptop keeps its own setup. The tool
// itself always starts at the Hand, so opening an exercise never draws by accident.
const STORAGE_KEY = "csm_annotation_tools";

interface StoredTools {
  swatchId: string;
  sizes: Record<string, InkSize>;
  eraser: EraserSetting;
  textSize: InkSize;
  textColour: string;
}

const isSize = (v: unknown): v is InkSize => v === "S" || v === "M" || v === "L";
const isEraser = (v: unknown): v is EraserSetting =>
  v === "stroke" || (typeof v === "string" && Object.keys(ERASER_RADIUS).includes(v));
const findSwatch = (id: string) => INK_SWATCHES.find((s) => s.id === id);

function readStored(): StoredTools {
  const fallback: StoredTools = { swatchId: "red", sizes: { ...DEFAULT_SIZES }, eraser: "M", textSize: "M", textColour: TEXT_BLACK.id };
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
      textSize: isSize(raw.textSize) ? raw.textSize : fallback.textSize,
      textColour: findTextSwatch(raw.textColour) ? raw.textColour : fallback.textColour,
    };
  } catch {
    return fallback;
  }
}

/**
 * The Pen Tray's settings, shared by both lesson views: the tool, whether
 * straight lines are on, the colour you last picked, each colour's size, the
 * eraser size, and the text's size and colour. It also holds a proof reason picked from the
 * tray while it waits for a tap on the page. The lesson views pass in whether
 * the lessons' saved ink has loaded, so the drawing layers can wait for it.
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
  const [textSize, setTextSize] = useState<InkSize>(stored.textSize);
  const [textColour, setTextColourId] = useState(stored.textColour);
  // A proof reason picked from the Pen Tray, waiting for a tap on the page to say where it goes.
  const [pendingText, setPendingText] = useState<TextPart[] | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ swatchId, sizes, eraser, textSize, textColour }));
    } catch { /* private window or storage full */ }
  }, [swatchId, sizes, eraser, textSize, textColour]);

  const swatch = findSwatch(swatchId) ?? INK_SWATCHES[0];

  // Picking a tool, by a button or a key, gives up on a reason waiting to be placed.
  const pick = useCallback((next: AnnotationTool) => {
    setPendingText(null);
    setMode({ tool: next, straight: false });
  }, []);
  const selectHand = useCallback(() => pick("hand"), [pick]);
  const selectEraser = useCallback(() => pick("eraser"), [pick]);
  const selectFade = useCallback(() => pick("fade"), [pick]);
  const selectLasso = useCallback(() => pick("lasso"), [pick]);
  const selectText = useCallback(() => pick("text"), [pick]);

  // Changing colour keeps straight lines on, so you can rule lines in several colours.
  const selectSwatch = useCallback((id: string) => {
    const next = findSwatch(id);
    if (!next) return;
    setPendingText(null);
    setSwatchId(id);
    setMode((m) => ({ tool: next.kind, straight: isInk(m.tool) && m.straight }));
  }, []);

  /**
   * The Straight lines button. With a pen or highlighter picked, it switches
   * straight lines on or off. With anything else picked, it goes back to the
   * colour you used last with straight lines on.
   */
  const toggleStraight = useCallback(() => {
    setPendingText(null);
    setMode((m) => (isInk(m.tool) ? { ...m, straight: !m.straight } : { tool: swatch.kind, straight: true }));
  }, [swatch.kind]);

  const setSwatchSize = useCallback((id: string, size: InkSize) => {
    setSizes((prev) => ({ ...prev, [id]: size }));
  }, []);

  /**
   * The D, E, L and T keys. D picks the pen or highlighter you used last, E
   * the eraser, L the lasso and T the Text tool. Pressing the key for the tool
   * you're already using puts it down and goes back to the Hand.
   */
  const toggleFromKey = useCallback((key: "pen" | "eraser" | "lasso" | "text") => {
    setPendingText(null);
    setMode((m) => {
      if (key !== "pen") return { tool: m.tool === key ? "hand" : key, straight: false };
      if (isInk(m.tool)) return { tool: "hand", straight: false };
      return { tool: swatch.kind, straight: false };
    });
  }, [swatch.kind]);

  /** Wait for a tap on the page to say where the given text goes, whatever tool is picked. */
  const placeText = useCallback((parts: TextPart[]) => setPendingText(parts.length > 0 ? parts : null), []);
  const cancelPlacing = useCallback(() => setPendingText(null), []);

  /** Pick the colour of new text, which is one of the text colours (see TEXT_SWATCHES). */
  const setTextColour = useCallback((id: string) => {
    if (findTextSwatch(id)) setTextColourId(id);
  }, []);
  const textSwatch = findTextSwatch(textColour) ?? TEXT_BLACK;

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
    /**
     * True whenever a tool other than the Hand is picked. One finger then
     * works on the page instead of scrolling it. A proof reason waiting to be
     * placed takes one finger too, whatever tool is picked, but the page's
     * drawing layer asks for that itself (see data-takes-one-finger in useViewerTouch).
     */
    drawingEnabled: tool !== "hand",
    /** The width of a new stroke in the picked colour. */
    inkSize: INK_SIZES[swatch.kind][sizes[swatch.id]],
    /** How far the rubbing eraser reaches, or null for the whole-stroke eraser. */
    eraserRadius: eraser === "stroke" ? null : ERASER_RADIUS[eraser],
    /** The size of new text, typed or a proof reason. */
    textSize,
    /** The colour of new text, as the id of one of the text colours. */
    textColour: textSwatch.id,
    /** How new text looks: the size of its writing in page units, and its colour. */
    textStyle: { size: TEXT_SIZES[textSize], color: textSwatch.color },
    /** A proof reason waiting for a tap on the page to say where it goes, or null. */
    pendingText,
    /** False until the lessons' saved ink has loaded. Nothing draws before then. */
    inkReady,
    selectHand,
    selectEraser,
    selectFade,
    selectLasso,
    selectText,
    selectSwatch,
    toggleStraight,
    setSwatchSize,
    setEraser,
    setTextSize,
    setTextColour,
    toggleFromKey,
    placeText,
    cancelPlacing,
  }), [
    tool, straight, swatch, sizes, eraser, textSize, textSwatch, pendingText, inkReady,
    selectHand, selectEraser, selectFade, selectLasso, selectText, selectSwatch, toggleStraight, setSwatchSize,
    setTextColour, toggleFromKey, placeText, cancelPlacing,
  ]);
}

export type AnnotationTools = ReturnType<typeof useAnnotationTools>;

/**
 * The Pen Tray's settings as a drawing layer's props. The worksheet's pages
 * and the Draft's sheets both draw with them, so a new tool setting only has
 * to be passed on here.
 */
export function inkLayerProps(tools: AnnotationTools) {
  const { tool } = tools;
  return {
    isDrawing: isInk(tool) || tool === "fade",
    isErasing: tool === "eraser",
    isSelecting: tool === "lasso",
    isTyping: tool === "text",
    textStyle: tools.textStyle,
    placingText: tools.pendingText,
    onTextPlaced: tools.cancelPlacing,
    eraserRadius: tools.eraserRadius,
    penColor: tools.swatch.color,
    penSize: tools.inkSize,
    inkKind: tools.swatch.kind,
    straight: tools.straight,
    fading: tools.fading,
    inkReady: tools.inkReady,
  };
}
