"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnnotationLayer } from "./AnnotationLayer";
import { useViewerTouch } from "@/hooks/useViewerTouch";
import { usePdfDarkMode } from "@/hooks/usePdfDarkMode";
import type { AnnotationTools } from "@/hooks/useAnnotationTools";
import type { PageAnnotations, Stroke } from "@/hooks/useAnnotations";
import {
  DRAFT_GRID_COLOUR, DRAFT_PAGE_BASE, DRAFT_SHEET, DRAFT_SHEET_PT, DRAFT_SQUARE_PT,
  draftSheetsInUse, draftSquared,
} from "@/lib/draft-sheets";

interface DraftPaneProps {
  exerciseId: number;
  /** The exercise's annotations. The Draft's sheets are its pages from DRAFT_PAGE_BASE up. */
  annotations: PageAnnotations;
  onPageStrokesChange: (pageIndex: number, strokes: Stroke[]) => void;
  tools: AnnotationTools;
  onClose: () => void;
}

// The squares are a background sized as a share of the sheet, so they grow
// and shrink with it and line up with the squares in the saved PDF.
const SQUARED_PAPER: CSSProperties = {
  backgroundImage:
    `linear-gradient(to right, ${DRAFT_GRID_COLOUR.css} 1px, transparent 1px), ` +
    `linear-gradient(to bottom, ${DRAFT_GRID_COLOUR.css} 1px, transparent 1px)`,
  backgroundSize: `${(100 * DRAFT_SQUARE_PT) / DRAFT_SHEET_PT.width}% ${(100 * DRAFT_SQUARE_PT) / DRAFT_SHEET_PT.height}%`,
};

// The same filter the worksheet uses in dark PDF mode, so the two match.
const DARK_PAPER: CSSProperties = { filter: "invert(0.86) hue-rotate(180deg)" };

const barButton =
  "min-w-11 h-11 px-2.5 flex flex-none items-center justify-center gap-1.5 rounded text-sm font-medium transition-colors";
const barButtonIdle = "hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] text-[#8b7355] dark:text-[#a09080]";
const barButtonOn = "bg-[#a0704b] text-white";

/**
 * The Draft: sheets of blank or squared paper in a pane beside the worksheet,
 * for the tutor's working. It scrolls on its own, so the worksheet can move on
 * to another question while the working stays where it is.
 *
 * It uses the worksheet's Pen Tray and the same touch rules: one finger uses
 * the tool, and two fingers scroll. It always fits the pane's width, so a
 * pinch doesn't zoom it. Its ink is part of the exercise's own, so a single
 * undo history covers the worksheet and the Draft together.
 */
export function DraftPane({ exerciseId, annotations, onPageStrokesChange, tools, onClose }: DraftPaneProps) {
  const [squared, setSquared] = draftSquared.usePreference();
  const [pdfDarkMode] = usePdfDarkMode();
  // How many sheets each exercise's Draft has been given with "Add a sheet".
  // Sheets with ink on them are counted from the ink, so they survive a reload.
  const [sheetsAsked, setSheetsAsked] = useState<Record<number, number>>({});
  const sheetCount = Math.max(1, draftSheetsInUse(annotations), sheetsAsked[exerciseId] ?? 0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sheetRefs = useRef<(HTMLDivElement | null)[]>([]);
  const newSheetRef = useRef<number | null>(null);

  const { gestureActive, handlers } = useViewerTouch({
    scrollRef,
    getAnchor: () => sheetRefs.current[0] ?? null,
    handTool: !tools.drawingEnabled,
    zoom: 100,
    minZoom: 100,
    maxZoom: 100,
    previewZoom: () => {},
    commitZoom: () => {},
  });

  // Each exercise's Draft opens at its first sheet.
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 });
  }, [exerciseId]);

  // A sheet that was just added is scrolled into view, ready to write on.
  useEffect(() => {
    if (newSheetRef.current === null) return;
    sheetRefs.current[newSheetRef.current]?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    newSheetRef.current = null;
  }, [sheetCount]);

  const addSheet = () => {
    newSheetRef.current = sheetCount;
    setSheetsAsked((asked) => ({ ...asked, [exerciseId]: sheetCount + 1 }));
  };

  const eraserActive = tools.tool === "eraser";

  return (
    <section aria-label="Draft" className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#e8dcc8] dark:bg-[#1e1a14]">
      <div className={cn(
        "flex flex-nowrap items-center gap-1 px-2 py-0.5 min-w-0",
        "border-b border-[#d4c4a8] dark:border-[#3a3228] bg-[#f0e6d4] dark:bg-[#252018]",
      )}>
        <span className="ml-1 text-xs font-medium text-[#8b7355] dark:text-[#a09080]">Draft</span>
        <div className="flex-1" />
        <div role="group" aria-label="Paper" className="flex flex-none gap-0.5">
          <button type="button" aria-pressed={!squared} onClick={() => setSquared(false)} className={cn(barButton, squared ? barButtonIdle : barButtonOn)}>
            Blank
          </button>
          <button type="button" aria-pressed={squared} onClick={() => setSquared(true)} className={cn(barButton, squared ? barButtonOn : barButtonIdle)}>
            Squared
          </button>
        </div>
        <div className="flex-none h-6 w-px bg-[#d4c4a8] dark:bg-[#3a3228]" />
        <button type="button" onClick={onClose} aria-label="Close the draft" title="Close the draft" className={cn(barButton, barButtonIdle)}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        ref={scrollRef}
        {...handlers}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 md:p-4",
          !tools.drawingEnabled && "cursor-grab active:cursor-grabbing",
        )}
        // Every touch is handled here, as in the worksheet viewer: one finger for the tool, two to scroll.
        style={{ touchAction: "none" }}
      >
        <div className="flex flex-col items-center gap-4">
          {Array.from({ length: sheetCount }, (_, n) => {
            const pageIndex = DRAFT_PAGE_BASE + n;
            return (
              <div
                key={n}
                ref={(el) => { sheetRefs.current[n] = el; }}
                aria-label={`Draft sheet ${n + 1}`}
                className="relative w-full rounded shadow-lg ring-1 ring-black/5 dark:ring-white/5"
                style={{ aspectRatio: `${DRAFT_SHEET.width} / ${DRAFT_SHEET.height}` }}
              >
                {/* The paper and its ink darken together in dark PDF mode, as the worksheet does */}
                <div
                  className="absolute inset-0 rounded bg-white"
                  style={{ ...(squared ? SQUARED_PAPER : null), ...(pdfDarkMode ? DARK_PAPER : null) }}
                >
                  <AnnotationLayer
                    // A new exercise gets fresh layers, so fading ink from the last one doesn't linger
                    key={exerciseId}
                    width={DRAFT_SHEET.width}
                    height={DRAFT_SHEET.height}
                    strokes={annotations[pageIndex] || []}
                    isDrawing={tools.drawingEnabled && !eraserActive}
                    isErasing={eraserActive}
                    eraserRadius={tools.eraserRadius}
                    penColor={tools.swatch.color}
                    penSize={tools.inkSize}
                    inkKind={tools.swatch.kind}
                    straight={tools.straight}
                    fading={tools.fading}
                    onStrokesChange={(strokes) => onPageStrokesChange(pageIndex, strokes)}
                    suspended={gestureActive}
                  />
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addSheet}
            className={cn(barButton, "px-4 border border-[#d4c4a8] dark:border-[#3a3228] bg-[#f0e6d4] dark:bg-[#252018]", barButtonIdle)}
          >
            <Plus className="h-5 w-5" />
            Add a sheet
          </button>
        </div>
      </div>
    </section>
  );
}
