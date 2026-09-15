"use client";

import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref, type RefObject,
} from "react";
import { DraftingCompass, Moon, Plus, Sun, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropdownMenu, menuItemClass } from "@/components/ui/dropdown-menu";
import { AnnotationLayer, StrokePath } from "./AnnotationLayer";
import { UndoOfferBar } from "./UndoOfferBar";
import { PANE_TOOLS, PaneTools, paneToolLabel, usePaneTools } from "./PaneTools";
import { AnnotationTray, TRAY_CLEARANCE } from "./AnnotationTray";
import { AxesIcon, AxesPanel } from "./AxesPanel";
import { PAGE_BAR_HEIGHT, ZoomControls, tbBtn, tbBtnIdle, tbBtnOn, toolbarRow } from "./PdfPageViewer";
import { useViewerTouch } from "@/hooks/useViewerTouch";
import { PDF_DARK_FILTER, usePdfDarkMode } from "@/hooks/usePdfDarkMode";
import { inkLayerProps, type AnnotationTools } from "@/hooks/useAnnotationTools";
import { useUndoOffer } from "@/hooks/useUndoOffer";
import { CM } from "@/lib/drawing-guide";
import { hasInk, inkLayers, type PageAnnotations, type Stroke } from "@/hooks/useAnnotations";
import {
  DEFAULT_AXES, axesOrigin, axesStrokes, readAxesSettings, saveAxesSettings, type AxesSettings,
} from "@/lib/axes";
import { clamp, type Vec } from "@/lib/stroke-select";
import {
  DRAFT_GRID_COLOUR, DRAFT_PAGE_BASE, DRAFT_SHEET, DRAFT_SHEET_PT, DRAFT_SQUARE, DRAFT_SQUARE_PT,
  draftSheetsInUse, draftSquared, inkedDraftPages, readDraftZoom, saveDraftZoom, type DraftZoom,
} from "@/lib/draft-sheets";
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, computeFitZoom, stackZoomStyles } from "@/lib/zoom";

interface DraftPaneProps {
  exerciseId: number;
  /** The exercise's annotations. The Draft's sheets are its pages from DRAFT_PAGE_BASE up. */
  annotations: PageAnnotations;
  onPageStrokesChange: (pageIndex: number, strokes: Stroke[]) => void;
  /** Saves several pages' strokes as one change, for the lasso's Move. The worksheet is given the same one. */
  onPagesStrokesChange?: (pages: PageAnnotations) => void;
  /** Clears the given pages as one change, so one undo brings them all back. */
  onClearPages: (pageIndices: number[]) => void;
  /** Takes back the last change, for the Undo in the message after a clear. */
  onUndo?: () => void;
  tools: AnnotationTools;
  onClose: () => void;
  /** What the Draft is called on its bar, such as "Lesson draft" for the lesson's own. */
  title?: string;
  /** Buttons at the start of the bar, such as focus mode's way out when the Draft stands in for the worksheet. */
  barStart?: ReactNode;
  /**
   * The rest of the Pen Tray's handlers, for a Draft that holds a tray of its
   * own. The lesson's own Draft does, because it's on screen without a
   * worksheet to share one with. An exercise's Draft leaves this out.
   */
  ownTray?: { onRedo?: () => void; onClearAll?: () => void };
}

// The squares are a background sized as a share of the sheet, so they grow
// and shrink with it and line up with the squares in the saved PDF.
const SQUARED_PAPER: CSSProperties = {
  backgroundImage:
    `linear-gradient(to right, ${DRAFT_GRID_COLOUR.css} 1px, transparent 1px), ` +
    `linear-gradient(to bottom, ${DRAFT_GRID_COLOUR.css} 1px, transparent 1px)`,
  backgroundSize: `${(100 * DRAFT_SQUARE_PT) / DRAFT_SHEET_PT.width}% ${(100 * DRAFT_SQUARE_PT) / DRAFT_SHEET_PT.height}%`,
};

const DARK_PAPER: CSSProperties = { filter: PDF_DARK_FILTER };

// The gap between sheets in the column, its gap-4, in pixels.
const SHEET_GAP = 16;

// The Pen Tray floats in DraftTrayLane, at the end of this file, which stops
// at the top of the worksheet's page bar. This is how far the tray's top sits
// above the bottom of the Draft.
const TRAY_TOP = PAGE_BAR_HEIGHT + TRAY_CLEARANCE;

const barButton = cn(tbBtn, "transition-colors");
// The words on Tools and Clear only show when the Draft has room for them, as
// the worksheet's button words do. Narrower than that, the bar scrolls sideways.
const barLabel = "hidden @[440px]/draftbar:inline";
// Clear and its options grey out the same way when there's nothing to clear.
const greyedOut = "disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed";
const toolOption = cn(
  menuItemClass,
  "flex min-h-11 items-center gap-2 text-[#6b4c30] dark:text-[#d4a574] hover:bg-[#f5ebe0] dark:hover:bg-[#3a3228]",
);
const clearOption = cn(
  menuItemClass,
  "min-h-11 text-red-700 dark:text-red-400 hover:bg-[#f5ebe0] dark:hover:bg-[#3a3228]",
  greyedOut,
);

/**
 * Drawing a pair of axes goes through two steps. The panel of settings comes
 * first, and then a tap on a sheet says where the axes cross.
 */
type AxesStep = "closed" | "settings" | "placing";

/**
 * The Draft: sheets of blank or squared paper in a pane beside the worksheet,
 * for the tutor's working. It scrolls on its own, so the worksheet can move on
 * to another question while the working stays where it is.
 *
 * It shares the worksheet's Pen Tray, which floats across both panes while
 * the Draft is open, and it follows the same touch rules: one finger uses the
 * tool, and two fingers scroll or pinch to zoom. It zooms the way the
 * worksheet does, and each board remembers its zoom (see useSheetZoom). Its
 * ink is part of the exercise's own, so a single undo history covers the
 * worksheet and the Draft together.
 *
 * The lesson has a Draft of its own as well, which takes the worksheet's
 * place, so a tutor can start working before the lesson has any courseware.
 * With no worksheet beside it, it holds its own Pen Tray, and its ink is kept
 * under the lesson in the same way an exercise's is kept under the exercise.
 *
 * Its Tools menu also draws a pair of numbered axes, for a graph. They're set
 * up in a panel, placed with a tap, and drawn as ordinary ink in one change,
 * so a single undo takes them away again.
 */
export function DraftPane({
  exerciseId, annotations, onPageStrokesChange, onPagesStrokesChange, onClearPages, onUndo, tools, onClose,
  title = "Draft", barStart, ownTray,
}: DraftPaneProps) {
  const [squared, setSquared] = draftSquared.usePreference();
  const [pdfDarkMode, togglePdfDarkMode] = usePdfDarkMode();
  // "Hide ink" on a tray of the Draft's own. Beside a worksheet, the worksheet's tray hides only the worksheet's ink.
  const [inkHidden, setInkHidden] = useState(false);
  // A tray of the Draft's own sits at the bottom of the Draft, with no page bar below it.
  const trayTop = ownTray ? TRAY_CLEARANCE : TRAY_TOP;
  // How many sheets each exercise's Draft has been given with "Add a sheet".
  // Sheets with ink on them are counted from the ink, so they survive a reload.
  const [sheetsAsked, setSheetsAsked] = useState<Record<number, number>>({});
  const sheetsInUse = draftSheetsInUse(annotations);
  const sheetCount = Math.max(1, sheetsInUse, sheetsAsked[exerciseId] ?? 0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sheetRefs = useRef<(HTMLDivElement | null)[]>([]);
  const newSheetRef = useRef<number | null>(null);

  // The Draft's own ruler, protractor and compasses, from the Tools menu on
  // its bar. They lie in the column of sheets and zoom along with it, so a
  // centimetre on them is always a centimetre of the sheets.
  const columnRef = useRef<HTMLDivElement>(null);
  const paneTools = usePaneTools(columnRef, scrollRef);
  const { putAway } = paneTools;
  const sheetZoom = useSheetZoom(scrollRef, columnRef, sheetCount);

  // ---------- Axes ----------
  // The settings start at whatever this board used last, each time the panel opens.
  const [axesStep, setAxesStep] = useState<AxesStep>("closed");
  const [axesSettings, setAxesSettings] = useState<AxesSettings>(DEFAULT_AXES);
  const placing = axesStep === "placing";
  const endAxes = useCallback(() => setAxesStep("closed"), []);
  const openAxes = () => {
    setAxesSettings(readAxesSettings());
    setAxesStep("settings");
  };
  const changeAxesSettings = (next: AxesSettings) => {
    setAxesSettings(next);
    saveAxesSettings(next);
  };
  // The axes go onto the sheet as one change on one page, so one undo takes them all away again.
  const placeAxes = (sheet: number, origin: Vec) => {
    const pageIndex = DRAFT_PAGE_BASE + sheet;
    onPageStrokesChange(pageIndex, [...(annotations[pageIndex] ?? []), ...axesStrokes(origin, axesSettings)]);
    endAxes();
  };

  // Escape closes the panel or stops placing. The lesson views listen on the
  // window, which hears a key after the document does, so it stops here.
  // Without that, the same key press would also put the pen away or leave
  // the lesson.
  useEffect(() => {
    if (axesStep === "closed") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      endAxes();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [axesStep, endAxes]);

  const { gestureActive, handlers } = useViewerTouch({
    scrollRef,
    getAnchor: () => sheetRefs.current[0] ?? null,
    handTool: !tools.drawingEnabled,
    zoom: sheetZoom.zoom,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    previewZoom: sheetZoom.previewZoom,
    commitZoom: sheetZoom.commitZoom,
  });

  // Each exercise's Draft opens at its first sheet, with its tools put away and no axes half placed.
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 });
    putAway();
    endAxes();
  }, [exerciseId, putAway, endAxes]);

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

  // ---------- Clearing ----------
  // Both clears can be undone, and a message at the bottom of the pane offers
  // an Undo straight after each one, as the Pen Tray does for the worksheet.
  const undoOffer = useUndoOffer(annotations);
  // "This sheet" is whichever sheet fills most of the pane when the menu opens.
  const [sheetInView, setSheetInView] = useState(0);
  const draftHasInk = sheetsInUse > 0;
  const sheetHasInk = (n: number) => (annotations[DRAFT_PAGE_BASE + n]?.length ?? 0) > 0;

  const sheetMostInView = () => {
    const view = scrollRef.current?.getBoundingClientRect();
    let best = 0;
    let bestHeight = -Infinity;
    if (view) {
      sheetRefs.current.slice(0, sheetCount).forEach((sheet, n) => {
        const box = sheet?.getBoundingClientRect();
        if (!box) return;
        const height = Math.min(box.bottom, view.bottom) - Math.max(box.top, view.top);
        if (height > bestHeight) { best = n; bestHeight = height; }
      });
    }
    return best;
  };

  const clearSheet = (n: number) => {
    onClearPages([DRAFT_PAGE_BASE + n]);
    undoOffer.offer(`Sheet ${n + 1} of the draft was cleared.`);
  };

  // Clearing the whole draft takes it back to one sheet as well. Undo brings
  // the ink back, and its sheets with it, because they're counted from the ink.
  const clearDraft = () => {
    onClearPages(inkedDraftPages(annotations));
    setSheetsAsked((asked) => ({ ...asked, [exerciseId]: 0 }));
    scrollRef.current?.scrollTo?.({ top: 0 });
    undoOffer.offer("The draft was cleared.");
  };

  return (
    <section aria-label={title} className="relative flex-1 flex flex-col min-h-0 min-w-0 bg-[#e8dcc8] dark:bg-[#1e1a14]">
      <div className={cn(toolbarRow, "@container/draftbar")}>
        {barStart}
        <span className="ml-1 whitespace-nowrap text-xs font-medium text-[#8b7355] dark:text-[#a09080]">{title}</span>
        <div className="flex-1" />
        <div className="flex flex-none items-center gap-0.5">
          <ZoomControls zoom={sheetZoom.zoom} onZoomOut={sheetZoom.zoomOut} onZoomIn={sheetZoom.zoomIn} onFitWidth={sheetZoom.fitWidth} />
        </div>
        <div role="group" aria-label="Paper" className="flex flex-none gap-0.5">
          <button type="button" aria-pressed={!squared} onClick={() => setSquared(false)} className={cn(barButton, squared ? tbBtnIdle : tbBtnOn)}>
            Blank
          </button>
          <button type="button" aria-pressed={squared} onClick={() => setSquared(true)} className={cn(barButton, squared ? tbBtnOn : tbBtnIdle)}>
            Squared
          </button>
        </div>
        {/* The ruler, the protractor and the compasses share one menu, which
            shows as on while any of them is out. Draw axes comes after them,
            set apart by a thin rule, because it draws ink once and puts no
            tool out. It waits for the lesson's saved ink, so the axes can't
            replace ink the sheet hasn't received yet. */}
        <DropdownMenu
          align="right"
          menuClassName="bg-[#fef9f3] dark:bg-[#2d2618] border-[#e8d4b8] dark:border-[#6b5a4a]"
          trigger={({ triggerProps }) => (
            <button
              type="button"
              {...triggerProps}
              title="Put a ruler, a protractor or compasses on the draft, or draw axes"
              aria-label="Tools"
              className={cn(barButton, paneTools.anyOut ? tbBtnOn : tbBtnIdle)}
            >
              <DraftingCompass className="h-5 w-5" />
              <span className={barLabel}>Tools</span>
            </button>
          )}
        >
          {(close) => (
            <>
              {PANE_TOOLS.map(({ kind, Icon, name }) => (
                <button key={kind} type="button" role="menuitem" onClick={() => { close(); paneTools.toggle(kind); }} className={toolOption}>
                  <Icon className="h-5 w-5" />
                  {paneToolLabel(name, paneTools.placed[kind] !== undefined)}
                </button>
              ))}
              <div role="separator" className="my-1 h-px bg-[#e8d4b8] dark:bg-[#6b5a4a]" />
              <button
                type="button"
                role="menuitem"
                disabled={!tools.inkReady}
                onClick={() => { close(); openAxes(); }}
                className={cn(toolOption, greyedOut)}
              >
                <AxesIcon className="h-5 w-5" />
                Draw axes
              </button>
            </>
          )}
        </DropdownMenu>
        <DropdownMenu
          align="right"
          menuClassName="bg-[#fef9f3] dark:bg-[#2d2618] border-[#e8d4b8] dark:border-[#6b5a4a]"
          trigger={({ triggerProps }) => (
            <button
              type="button"
              {...triggerProps}
              onClick={() => {
                setSheetInView(sheetMostInView());
                undoOffer.drop();
                triggerProps.onClick();
              }}
              disabled={!draftHasInk}
              title="Clear"
              aria-label="Clear"
              className={cn(barButton, tbBtnIdle, greyedOut)}
            >
              <Trash2 className="h-5 w-5" />
              <span className={barLabel}>Clear</span>
            </button>
          )}
        >
          {(close) => (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={!sheetHasInk(sheetInView)}
                onClick={() => { close(); clearSheet(sheetInView); }}
                className={clearOption}
              >
                <span>
                  Clear this sheet
                  <small className="block text-xs font-normal opacity-70">Sheet {sheetInView + 1}</small>
                </span>
              </button>
              <button type="button" role="menuitem" onClick={() => { close(); clearDraft(); }} className={clearOption}>
                Clear the draft
              </button>
            </>
          )}
        </DropdownMenu>
        {/* The lesson's own Draft has no worksheet toolbar beside it, so it
            carries the board's dark switch itself. It's the same one setting,
            so the whole board stays dark or light together. */}
        {ownTray && (
          <button
            type="button"
            onClick={togglePdfDarkMode}
            title={pdfDarkMode ? "Light PDF mode" : "Dark PDF mode"}
            aria-label="Dark PDF mode"
            aria-pressed={pdfDarkMode}
            className={cn(barButton, tbBtnIdle, pdfDarkMode && "!text-yellow-500 dark:!text-yellow-400")}
          >
            {pdfDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        )}
        <div className="flex-none h-6 w-px bg-[#d4c4a8] dark:bg-[#3a3228]" />
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close the ${title.toLowerCase()}`}
          title={`Close the ${title.toLowerCase()}`}
          className={cn(barButton, tbBtnIdle)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* The sheets, with the axes panel and the placing hint floating over the top of them */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        <div
          ref={scrollRef}
          {...handlers}
          className={cn(
            "flex-1 min-h-0 overflow-y-auto px-2 pt-2 md:px-4 md:pt-4",
            !tools.drawingEnabled && "cursor-grab active:cursor-grabbing",
          )}
          // Every touch is handled here, as in the worksheet viewer: one finger for the tool, two to scroll or pinch.
          // The room at the bottom lets the last sheet and "Add a sheet" scroll clear of the tray.
          style={{ touchAction: "none", paddingBottom: trayTop + 20, ...sheetZoom.styles.scroller }}
        >
          {/* The sheets are laid out at their natural size, A4 at the same scale as a worksheet's page, and the whole column is scaled */}
          <div ref={columnRef} className="relative flex flex-col gap-4" style={{ ...sheetZoom.styles.stack, transformOrigin: "top left" }}>
            {Array.from({ length: sheetCount }, (_, n) => {
              const pageIndex = DRAFT_PAGE_BASE + n;
              return (
                <div
                  key={n}
                  ref={(el) => { sheetRefs.current[n] = el; }}
                  aria-label={`Draft sheet ${n + 1}`}
                  className="relative flex-none rounded shadow-lg ring-1 ring-black/5 dark:ring-white/5"
                  style={{ width: DRAFT_SHEET.width, height: DRAFT_SHEET.height }}
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
                      hidden={inkHidden}
                      {...inkLayerProps(tools)}
                      onStrokesChange={(strokes) => onPageStrokesChange(pageIndex, strokes)}
                      // Nothing draws while the axes are being placed, whatever is picked on the tray.
                      suspended={gestureActive || placing}
                      uiScale={sheetZoom.zoom / 100}
                      guides={paneTools.guides}
                      // On squared paper, straight lines and the tools snap to the squares' corners too.
                      gridSpacing={squared ? DRAFT_SQUARE : undefined}
                      pageIndex={pageIndex}
                      pageLabel={`Draft sheet ${n + 1}`}
                      onPagesChange={onPagesStrokesChange}
                    />
                  </div>
                </div>
              );
            })}
            <PaneTools state={paneTools} containerRef={columnRef} cm={CM} darkMode={pdfDarkMode} />
            {placing && (
              <AxesPlacing
                sheetRefs={sheetRefs}
                sheetCount={sheetCount}
                squared={squared}
                settings={axesSettings}
                suspended={gestureActive}
                darkMode={pdfDarkMode}
                onPlace={placeAxes}
              />
            )}
          </div>
          {/* "Add a sheet" comes after the scaled column, so it stays the size of a finger at any zoom */}
          <div className="flex justify-center pt-4">
            <button
              type="button"
              onClick={addSheet}
              className={cn(barButton, "px-4 border border-[#d4c4a8] dark:border-[#3a3228] bg-[#f0e6d4] dark:bg-[#252018]", tbBtnIdle)}
            >
              <Plus className="h-5 w-5" />
              Add a sheet
            </button>
          </div>
        </div>

        {axesStep === "settings" && (
          <AxesPanel
            settings={axesSettings}
            onChange={changeAxesSettings}
            onPlace={() => setAxesStep("placing")}
            onClose={endAxes}
          />
        )}
        {placing && (
          <div
            className={cn(
              "absolute left-1/2 top-2 z-30 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-2 rounded-lg py-1 pl-4 pr-1",
              "bg-[#2e251c]/90 text-sm text-[#f3e7d3] shadow-lg",
            )}
          >
            <span>Tap where the axes should cross.</span>
            <button type="button" onClick={endAxes} className="min-h-11 rounded-md px-3 font-medium hover:bg-white/10">
              Cancel
            </button>
          </div>
        )}
      </div>

      {undoOffer.message && (
        <UndoOfferBar
          message={undoOffer.message}
          onUndo={onUndo && (() => { undoOffer.drop(); onUndo(); })}
          // It sits just above the tray, where the tray's own messages appear.
          style={{ bottom: trayTop + 10 }}
          className="absolute left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-2rem)]"
        />
      )}

      {/* The lesson's own Draft has no worksheet beside it to share a Pen Tray with, so it holds one of its own */}
      {ownTray && (
        <AnnotationTray
          tools={tools}
          onUndo={onUndo}
          onRedo={ownTray.onRedo}
          inkHidden={inkHidden}
          onInkHiddenChange={setInkHidden}
          hasInk={hasInk(annotations)}
          onClearAll={ownTray.onClearAll}
          paneTools={paneTools}
          inkRevision={annotations}
        />
      )}
    </section>
  );
}

/**
 * The Draft's zoom, which works like the worksheet's. The buttons on its bar
 * step it, a pinch sets it, and Fit to width goes back to following the
 * pane's width as the pane changes size. It opens at fit-to-width, and each
 * board remembers what was chosen last, so moving to another exercise, or
 * coming back after a reload, keeps it. The column of sheets is laid out at
 * their natural size and scaled (see stackZoomStyles), and during a pinch the
 * zoom is written straight onto the column without a React render.
 */
function useSheetZoom(
  scrollRef: RefObject<HTMLDivElement | null>,
  columnRef: RefObject<HTMLDivElement | null>,
  sheetCount: number,
) {
  const [choice, setChoice] = useState<DraftZoom>("fit");
  const [fit, setFit] = useState(100);
  const zoom = choice === "fit" ? fit : choice;

  // The board's choice is read once the Draft is on screen. The fit is
  // measured before the sheets are first painted, and again whenever the pane
  // changes size. A pane with no width yet, such as a hidden one, keeps the
  // fit it had.
  useLayoutEffect(() => {
    setChoice(readDraftZoom());
    const scroller = scrollRef.current;
    if (!scroller) return;
    const measure = () => {
      if (scroller.clientWidth > 0) setFit(clamp(computeFitZoom(scroller, DRAFT_SHEET.width), MIN_ZOOM, MAX_ZOOM));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scrollRef]);

  // Back at the pane's width or narrower, there's nothing to scroll sideways to.
  useEffect(() => {
    if (zoom <= fit && scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [zoom, fit, scrollRef]);

  const naturalHeight = sheetCount * DRAFT_SHEET.height + (sheetCount - 1) * SHEET_GAP;
  const stylesAt = (z: number) => stackZoomStyles(z, fit, naturalHeight);

  const choose = (next: DraftZoom) => {
    setChoice(next);
    saveDraftZoom(next);
  };

  const previewZoom = (z: number) => {
    const column = columnRef.current;
    const scroller = scrollRef.current;
    if (!column || !scroller) return;
    const styles = stylesAt(z);
    Object.assign(column.style, styles.stack);
    Object.assign(scroller.style, styles.scroller);
  };

  return {
    zoom,
    styles: stylesAt(zoom),
    previewZoom,
    // The whole-number zoom that's kept is shown straight away, so the sheets
    // already match what React renders next, even when a pinch ends back
    // where it started.
    commitZoom: (z: number) => {
      const settled = Math.round(z);
      previewZoom(settled);
      choose(settled);
    },
    zoomIn: () => choose(Math.min(zoom + ZOOM_STEP, MAX_ZOOM)),
    zoomOut: () => choose(Math.max(zoom - ZOOM_STEP, MIN_ZOOM)),
    fitWidth: () => choose("fit"),
  };
}

interface AxesPlacingProps {
  /** The Draft's sheets, and how many of them are showing. */
  sheetRefs: RefObject<(HTMLDivElement | null)[]>;
  sheetCount: number;
  squared: boolean;
  settings: AxesSettings;
  /** True while two fingers are scrolling the Draft, which drops the preview. */
  suspended: boolean;
  darkMode: boolean;
  /** Called once the finger lifts, with the sheet and where on it the axes cross, in page units. */
  onPlace: (sheet: number, origin: Vec) => void;
}

/** Where a sheet sits in the column of sheets, which is where the preview goes. */
interface SheetBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The layer that takes the tap saying where a pair of axes should cross. It
 * lies over the whole column of sheets while the axes are being placed, above
 * the drawing layers, so a pen picked on the tray can't draw meanwhile. It's
 * inside the Draft's scroll box and marked data-takes-one-finger, which tells
 * useViewerTouch that one finger belongs to it even with the Hand picked,
 * while two fingers still scroll the Draft.
 *
 * A board has no hover, so with a plain tap you'd have no idea where the axes
 * would land until they were drawn. So a finger going down shows a faint
 * preview of the axes crossing there, or on the nearest corner of the
 * squares on squared paper. Dragging moves the preview, and lifting the
 * finger draws the axes where the preview is. A quick tap still works, and
 * it places the axes where it landed. A finger that lands between sheets, or
 * on "Add a sheet", does nothing.
 */
function AxesPlacing({ sheetRefs, sheetCount, squared, settings, suspended, darkMode, onPlace }: AxesPlacingProps) {
  const pressRef = useRef<{ pointerId: number; sheet: number } | null>(null);
  const [preview, setPreview] = useState<{ sheet: number; origin: Vec; box: SheetBox } | null>(null);

  const dropPreview = useCallback(() => {
    pressRef.current = null;
    setPreview(null);
  }, []);
  // A second finger turns the touch into a scroll, and the preview goes.
  useEffect(() => {
    if (suspended) dropPreview();
  }, [suspended, dropPreview]);

  const sheetUnder = (x: number, y: number): number | null => {
    for (let n = 0; n < sheetCount; n++) {
      const box = sheetRefs.current[n]?.getBoundingClientRect();
      if (box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return n;
    }
    return null;
  };

  /** Where the axes would cross for a finger at this point on screen, kept to the given sheet, in its page units. */
  const originOn = (sheet: number, x: number, y: number): Vec | null => {
    const box = sheetRefs.current[sheet]?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    return axesOrigin([
      clamp(((x - box.left) / box.width) * DRAFT_SHEET.width, 0, DRAFT_SHEET.width),
      clamp(((y - box.top) / box.height) * DRAFT_SHEET.height, 0, DRAFT_SHEET.height),
    ], squared);
  };

  // On squared paper the crossing only moves from one corner to the next, so most moves change nothing.
  const show = (sheet: number, origin: Vec) => {
    const el = sheetRefs.current[sheet];
    if (!el) return;
    setPreview((prev) =>
      prev && prev.sheet === sheet && prev.origin[0] === origin[0] && prev.origin[1] === origin[1]
        ? prev
        : { sheet, origin, box: { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } },
    );
  };

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pressRef.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    const sheet = sheetUnder(e.clientX, e.clientY);
    const origin = sheet === null ? null : originOn(sheet, e.clientX, e.clientY);
    if (sheet === null || !origin) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the finger has already lifted */ }
    pressRef.current = { pointerId: e.pointerId, sheet };
    show(sheet, origin);
  };

  // A drag keeps to the sheet the finger went down on.
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== e.pointerId) return;
    const origin = originOn(press.sheet, e.clientX, e.clientY);
    if (origin) show(press.sheet, origin);
  };

  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== e.pointerId) return;
    const origin = originOn(press.sheet, e.clientX, e.clientY);
    dropPreview();
    if (origin) onPlace(press.sheet, origin);
  };

  const cancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pressRef.current?.pointerId === e.pointerId) dropPreview();
  };

  // In the order the ink's layers paint them, so the axis lines sit over their marks as they will on the sheet.
  const strokes = useMemo(() => (preview ? inkLayers(axesStrokes(preview.origin, settings)).flat() : []), [preview, settings]);

  return (
    <>
      <div
        data-takes-one-finger=""
        data-axes-placing=""
        className="absolute inset-0 z-20 cursor-crosshair"
        style={{ touchAction: "none" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
      />
      {preview && (
        <svg
          data-axes-preview=""
          aria-hidden="true"
          viewBox={`0 0 ${DRAFT_SHEET.width} ${DRAFT_SHEET.height}`}
          className="pointer-events-none absolute z-20"
          style={{ ...preview.box, filter: darkMode ? PDF_DARK_FILTER : undefined }}
        >
          {/* Drawn the same way the ink will be, only fainter */}
          <g opacity={0.45}>
            {strokes.map((stroke, i) => <StrokePath key={i} stroke={stroke} />)}
          </g>
        </svg>
      )}
    </>
  );
}

/**
 * The lane the Pen Tray floats in while the Draft is open. A lesson view puts
 * it in the box that holds the worksheet and the Draft, and hands it to the
 * worksheet's viewer, which draws its tray in here. Touches pass through it to
 * the panes underneath. It stops at the top of the worksheet's page bar, so
 * the tray sits just above the bar.
 *
 * Below 1100px the answer key can slide in over the Draft (see
 * FoldingAnswerKey). While it's there, the lane keeps to the worksheet, which
 * is half the width less half the line between the two panes. For that to
 * work, the row of viewers needs the `group/viewers` class as well as being
 * the "viewers" container.
 */
export function DraftTrayLane({ ref }: { ref: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn(
        "absolute left-0 right-0 top-0 pointer-events-none",
        "@max-[1100px]/viewers:group-has-[[data-answers-out]]/viewers:right-[calc(50%+0.5px)]",
      )}
      style={{ bottom: PAGE_BAR_HEIGHT }}
    />
  );
}
