"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Hand, Eraser, Undo2, Redo2, Ellipsis, ChevronsDown, GripVertical,
  Eye, EyeOff, Trash2, Download, WandSparkles, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  useFloating, offset, flip, shift, autoUpdate, useDismiss, useInteractions, FloatingPortal,
} from "@floating-ui/react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  INK_SWATCHES, INK_SIZES, type AnnotationTools, type InkSize, type InkSwatch,
} from "@/hooks/useAnnotationTools";
import type { EraserSetting } from "@/lib/stroke-eraser";
import { useUndoOffer } from "@/hooks/useUndoOffer";
import { UndoOfferBar } from "./UndoOfferBar";

type Dock = "left" | "center" | "right";

interface AnnotationTrayProps {
  tools: AnnotationTools;
  onUndo?: () => void;
  onRedo?: () => void;
  inkHidden: boolean;
  onInkHiddenChange: (hidden: boolean) => void;
  /** Whether this exercise has any ink, for clearing and saving. */
  hasInk: boolean;
  onClearAll?: () => void;
  /**
   * The page in view, for "Clear this page". Leave it out when the exercise
   * has only one page, where clearing the page and clearing all are the same.
   */
  pageInView?: { number: number; hasInk: boolean };
  onClearPage?: () => void;
  /**
   * Anything that changes whenever the ink does, such as the exercise's
   * annotations object. The message offering to undo a clear goes away when
   * it changes, so that message's Undo can only ever take back the clear.
   */
  inkRevision?: unknown;
  onSaveAnnotated?: () => void;
}

// Where each browser left its tray, so the board in each room keeps its own.
const STORAGE_KEY = "csm_annotation_tray";
const MARGIN = 16;
// The round button the tray collapses into is as tall as the tray itself,
// which is what lets the tray morph into it.
const FAB = 60;
/**
 * How far the top of the tray sits above the bottom of its area. A pane the
 * tray floats over needs this much room at the bottom, so its last lines can
 * scroll clear of the tray.
 */
export const TRAY_CLEARANCE = MARGIN + FAB;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

const PENS = INK_SWATCHES.filter((s) => s.kind === "pen");
const HIGHLIGHTERS = INK_SWATCHES.filter((s) => s.kind === "highlighter");

const SIZE_NAMES: Record<InkSize, string> = { S: "Small", M: "Medium", L: "Large" };
// Each eraser size is shown as a dashed circle this many pixels across.
const ERASER_CHOICES: { value: EraserSetting; title: string; circle?: number }[] = [
  { value: "S", title: "Small eraser", circle: 14 },
  { value: "M", title: "Medium eraser", circle: 24 },
  { value: "L", title: "Large eraser", circle: 38 },
  { value: "stroke", title: "Whole-stroke eraser: tap a stroke to remove all of it" },
];

type Pop = "sizes" | "eraser" | "more";

function readTrayState(): { dock: Dock; collapsed: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    const dock: Dock = raw?.dock === "left" || raw?.dock === "right" ? raw.dock : "center";
    return { dock, collapsed: raw?.collapsed === true };
  } catch {
    return { dock: "center", collapsed: false };
  }
}

const canAnimate = (el: HTMLElement | null, reducedMotion: boolean): el is HTMLElement =>
  !!el && typeof el.animate === "function" && !reducedMotion;

// The two ends of the collapse: the tray where it sits, and the round button
// in its corner. Collapsing morphs from the first to the second, and expanding
// morphs back.
const trayFrame = (tray: HTMLElement): Keyframe =>
  ({ left: `${tray.offsetLeft}px`, width: `${tray.offsetWidth}px`, borderRadius: "18px" });
const fabFrame = (left: number): Keyframe =>
  ({ left: `${left}px`, width: `${FAB}px`, borderRadius: `${FAB / 2}px` });

// The tray is a dark walnut ledge in both themes, so it reads as one object
// floating over the worksheet.
const btnBase =
  "relative flex-none w-12 h-12 rounded-xl grid place-items-center text-[#f3e7d3] transition-colors " +
  "hover:bg-[#f3e7d3]/10 disabled:opacity-35 disabled:hover:bg-transparent " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3e7d3]";
const btnOn = "bg-[#f3e7d3] text-[#2e251c] hover:bg-[#f3e7d3]";
const Separator = () => <span aria-hidden className="flex-none w-px h-7 mx-1 bg-[#4a3c2e] dark:bg-[#5a4a39]" />;

/** A colour's mark: a dot for a pen, a chisel tip for a highlighter. An outline passed in follows its shape. */
function SwatchMark({ swatch, big = false, className }: { swatch: InkSwatch; big?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "block shadow-[0_0_0_1.5px_rgba(243,231,211,0.4)]",
        swatch.kind === "pen"
          ? big ? "w-[26px] h-[26px] rounded-full" : "w-6 h-6 rounded-full"
          : big ? "w-[18px] h-[30px] rounded-[3px_9px_3px_3px]" : "w-4 h-6 rounded-[3px_8px_3px_3px]",
        className,
      )}
      style={{ backgroundColor: swatch.color }}
    />
  );
}

/**
 * The Pen Tray: a floating tray at the bottom of the lesson viewer that holds
 * every annotation tool. It never changes width when you pick something, so
 * its buttons stay put. Tapping the colour or eraser that's already picked
 * opens its sizes above the tray. It can be dragged to the left, middle or
 * right, and collapsed into a round button in its corner.
 *
 * While the Draft is open, the lesson views float the tray across the
 * worksheet and the Draft together, because it draws on both of them.
 *
 * When the viewer is too narrow for the whole tray, which happens with the
 * answer key open beside the worksheet, undo and redo move into the More menu
 * so that More and Collapse stay on screen. We call that the compact tray. It
 * only changes when the viewer is resized.
 */
export function AnnotationTray({
  tools, onUndo, onRedo, inkHidden, onInkHiddenChange, hasInk, onClearAll,
  pageInView, onClearPage, inkRevision, onSaveAnnotated,
}: AnnotationTrayProps) {
  const [{ dock, collapsed }, setTrayState] = useState(readTrayState);
  const [morphing, setMorphing] = useState(false);
  const [compact, setCompact] = useState(false);
  // The whole tray's width, measured whenever it's showing in full. The compact
  // tray can't measure it, because undo and redo aren't there.
  const fullWidthRef = useRef(0);
  const reducedMotion = useReducedMotion() ?? false;
  const trayRef = useRef<HTMLDivElement>(null);
  const morphRef = useRef<Animation | null>(null);
  const expandingRef = useRef(false);
  const poppingRef = useRef(false);
  const fabRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ x: number; left: number; max: number } | null>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ dock, collapsed })); } catch { /* storage unavailable */ }
  }, [dock, collapsed]);

  const areaWidth = () => trayRef.current?.parentElement?.clientWidth ?? 0;
  const fabLeft = useCallback(
    () => (dock === "left" ? MARGIN : areaWidth() - MARGIN - FAB),
    [dock],
  );

  // When even the compact tray is too wide for the viewer, it scrolls
  // sideways. The end with tools out of sight fades, and an arrow there
  // slides the tray along, so it's clear there's more.
  const [hiddenSides, setHiddenSides] = useState({ start: false, end: false });
  const updateHiddenSides = useCallback(() => {
    const tray = trayRef.current;
    // While the tray grows out of the round button, most of its tools really
    // are out of sight, so this waits and checks again once it has finished.
    if (!tray || morphRef.current) return;
    const start = tray.scrollLeft > 1;
    const end = tray.scrollLeft + tray.clientWidth < tray.scrollWidth - 1;
    setHiddenSides((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);
  const slideTray = (direction: 1 | -1) => {
    const tray = trayRef.current;
    tray?.scrollBy?.({ left: direction * tray.clientWidth * 0.6, behavior: reducedMotion ? "auto" : "smooth" });
  };

  /**
   * Put the tray where its dock says, leaving the side margin free. This is
   * also where the tray decides whether it has to be compact. When that
   * changes, the tray renders again and is placed once more at its new width.
   */
  const place = useCallback(() => {
    const tray = trayRef.current;
    if (!tray || dragRef.current) return;
    const width = areaWidth();
    if (!compact && !collapsed) fullWidthRef.current = tray.scrollWidth;
    // An area with no width hasn't been laid out yet, so it says nothing about fitting.
    const needsCompact = width > 0 && fullWidthRef.current > width - 2 * MARGIN;
    if (needsCompact !== compact) { setCompact(needsCompact); return; }
    // A collapsed tray is hidden, so there's nothing to place until it opens.
    if (collapsed) return;
    // The tray's width is worked out from its tools, capped at the room there
    // is. Its box on screen can't be used for this, because while the tray is
    // growing out of the round button, its box is still the button's width.
    const trayWidth = Math.min(tray.scrollWidth, width - 2 * MARGIN);
    const left = dock === "left" ? MARGIN : dock === "right" ? width - trayWidth - MARGIN : (width - trayWidth) / 2;
    tray.style.left = `${Math.max(MARGIN, left)}px`;
    updateHiddenSides();
  }, [dock, compact, collapsed, updateHiddenSides]);

  useLayoutEffect(() => {
    place();
    const area = trayRef.current?.parentElement;
    if (!area) return;
    const observer = new ResizeObserver(() => place());
    observer.observe(area);
    return () => observer.disconnect();
  }, [place]);

  // ---------- Pop-outs ----------

  // The sizes pop-out only ever opens for the colour that's picked, so it
  // needs no note of which colour it's for.
  const [pop, setPop] = useState<Pop | null>(null);
  const { refs, floatingStyles, context } = useFloating({
    open: pop !== null,
    onOpenChange: (open) => { if (!open) setPop(null); },
    placement: "top",
    middleware: [offset(10), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const { getFloatingProps } = useInteractions([useDismiss(context)]);

  // ---------- Undoing a clear ----------
  // Clearing takes one tap, and then a message above the tray offers to undo
  // it. The message goes after a few seconds, or as soon as the ink changes in
  // any other way, which includes the tray's own Undo.

  const { message: undoOffer, offer, drop: dropUndoOffer } = useUndoOffer(inkRevision);
  const offerFloating = useFloating({
    open: undoOffer !== null,
    placement: "top",
    middleware: [offset(10), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const offerUndo = (message: string) => {
    offerFloating.refs.setReference(trayRef.current);
    offer(message);
  };

  const togglePop = (next: Pop, anchor: HTMLElement) => {
    if (pop === next) { setPop(null); return; }
    dropUndoOffer();
    refs.setReference(anchor);
    setPop(next);
  };

  // ---------- Tools ----------

  const isPicked = (swatch: InkSwatch) => tools.tool === swatch.kind && tools.swatch.id === swatch.id;

  const handleSwatch = (swatch: InkSwatch, anchor: HTMLElement) => {
    if (isPicked(swatch)) { togglePop("sizes", anchor); return; }
    setPop(null);
    tools.selectSwatch(swatch.id);
  };

  const handleEraser = (anchor: HTMLElement) => {
    if (tools.tool === "eraser") { togglePop("eraser", anchor); return; }
    setPop(null);
    tools.selectEraser();
  };

  // ---------- Dragging ----------

  const onGripDown = (e: React.PointerEvent) => {
    const tray = trayRef.current;
    if (!tray) return;
    e.preventDefault();
    setPop(null);
    dragRef.current = { x: e.clientX, left: tray.offsetLeft, max: areaWidth() - tray.offsetWidth - 8 };
    tray.style.transition = "none";
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onGripMove = (e: React.PointerEvent) => {
    const tray = trayRef.current, drag = dragRef.current;
    if (!tray || !drag) return;
    tray.style.left = `${Math.max(8, Math.min(drag.left + e.clientX - drag.x, drag.max))}px`;
  };
  const onGripUp = () => {
    const tray = trayRef.current;
    if (!tray || !dragRef.current) return;
    dragRef.current = null;
    tray.style.transition = "left 0.18s ease-out";
    const width = areaWidth();
    const centre = tray.offsetLeft + tray.offsetWidth / 2;
    const next: Dock = centre < width / 3 ? "left" : centre > (width * 2) / 3 ? "right" : "center";
    setTrayState((s) => ({ ...s, dock: next }));
    place();
  };
  const onGripKey = (e: React.KeyboardEvent) => {
    const order: Dock[] = ["left", "center", "right"];
    const i = order.indexOf(dock);
    if (e.key === "ArrowLeft" && i > 0) setTrayState((s) => ({ ...s, dock: order[i - 1] }));
    if (e.key === "ArrowRight" && i < 2) setTrayState((s) => ({ ...s, dock: order[i + 1] }));
  };

  // ---------- Collapsing ----------
  // Collapsing fades the buttons, then narrows the tray and slides it into the
  // round button's spot. Expanding plays that backwards out of the corner.

  const collapse = () => {
    setPop(null);
    dropUndoOffer();
    const tray = trayRef.current;
    morphRef.current?.cancel();
    if (!canAnimate(tray, reducedMotion)) { setTrayState((s) => ({ ...s, collapsed: true })); return; }
    setMorphing(true);
    tray.style.transition = "none";
    const anim = tray.animate(
      [trayFrame(tray), fabFrame(fabLeft())],
      { duration: 320, delay: 70, easing: EASE, fill: "forwards" },
    );
    morphRef.current = anim;
    anim.onfinish = () => {
      morphRef.current = null;
      poppingRef.current = true;
      setTrayState((s) => ({ ...s, collapsed: true }));
      anim.cancel();
      setMorphing(false);
    };
  };

  // The round button settles in once the tray has shrunk into its spot.
  useLayoutEffect(() => {
    const fab = fabRef.current;
    if (!collapsed || !poppingRef.current) return;
    poppingRef.current = false;
    if (canAnimate(fab, reducedMotion)) {
      fab.animate([{ opacity: 0.5, transform: "scale(0.92)" }, { opacity: 1, transform: "scale(1)" }], { duration: 160, easing: EASE });
    }
  }, [collapsed, reducedMotion]);

  const expand = () => {
    expandingRef.current = true;
    setTrayState((s) => ({ ...s, collapsed: false }));
  };

  useLayoutEffect(() => {
    const tray = trayRef.current;
    if (collapsed || !expandingRef.current) return;
    expandingRef.current = false;
    place();
    if (!canAnimate(tray, reducedMotion)) return;
    setMorphing(true);
    tray.style.transition = "none";
    const anim = tray.animate([fabFrame(fabLeft()), trayFrame(tray)], { duration: 320, easing: EASE });
    morphRef.current = anim;
    anim.onfinish = () => { morphRef.current = null; setMorphing(false); updateHiddenSides(); };
  }, [collapsed, place, fabLeft, reducedMotion, updateHiddenSides]);

  useEffect(() => () => morphRef.current?.cancel(), []);

  // ---------- Rendering ----------

  const toolName =
    tools.tool === "hand" ? "the Hand"
    : tools.tool === "eraser" ? "the eraser"
    : tools.fading ? "fading ink"
    : `the ${tools.swatch.label.toLowerCase()}${tools.straight ? " with straight lines on" : ""}`;

  const swatchButton = (swatch: InkSwatch) => {
    const on = isPicked(swatch);
    return (
      <button
        key={swatch.id}
        type="button"
        aria-label={swatch.label}
        title={on ? `${swatch.label}: tap again for sizes` : swatch.label}
        aria-pressed={on}
        onClick={(e) => handleSwatch(swatch, e.currentTarget)}
        className={cn(btnBase, on && "bg-[#f3e7d3]/15 hover:bg-[#f3e7d3]/15")}
      >
        {/* The picked colour rises a little inside its ring, leaving room for the size letter below it */}
        <SwatchMark
          swatch={swatch}
          className={cn("transition-transform", on && "-translate-y-[3px] outline-2 outline-offset-2 outline-[#f3e7d3]")}
        />
        {on && <SizeBadge>{tools.sizes[swatch.id]}</SizeBadge>}
      </button>
    );
  };

  return (
    <>
      <div
        ref={trayRef}
        role="toolbar"
        aria-label="Annotation tools"
        onScroll={updateHiddenSides}
        aria-hidden={collapsed || undefined}
        className={cn(
          "absolute bottom-4 z-20 flex items-center gap-1 p-1.5 rounded-[18px]",
          "bg-[#2e251c] dark:bg-[#3b3025] text-[#f3e7d3]",
          "shadow-[0_12px_32px_rgba(46,30,14,0.3),inset_0_1px_0_rgba(255,255,255,0.06)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.55)]",
          // It keeps the side margin clear at both ends, even when it has to scroll.
          "max-w-[calc(100%-32px)] overflow-x-auto [scrollbar-width:none] select-none",
          // The area the lesson views float it in lets touches through to the panes underneath.
          "pointer-events-auto",
          // If even the compact tray is too wide, a finger can swipe it sideways to reach the end.
          compact ? "touch-pan-x overscroll-x-contain" : "touch-none",
          "[&>*]:transition-opacity [&>*]:duration-150",
          morphing && "overflow-hidden [&>*]:opacity-0 [&>*]:duration-75",
          collapsed && "hidden",
        )}
      >
        <TrayEdge side="start" shown={hiddenSides.start} onSlide={() => slideTray(-1)} />
        <button
          type="button"
          aria-label="Drag the tray to the left, middle or right"
          title="Drag the tray to the left, middle or right"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          onKeyDown={onGripKey}
          className="flex-none w-[26px] h-12 grid place-items-center cursor-grab active:cursor-grabbing text-[#f3e7d3]/55 touch-none"
        >
          <GripVertical className="h-[18px] w-[18px]" />
        </button>

        <button
          type="button"
          aria-label="Hand: scroll the worksheet with one finger"
          title="Hand: scroll the worksheet with one finger (Esc)"
          aria-pressed={tools.tool === "hand"}
          onClick={() => { setPop(null); tools.selectHand(); }}
          className={cn(btnBase, tools.tool === "hand" && btnOn)}
        >
          <Hand className="h-[22px] w-[22px]" />
        </button>
        <button
          type="button"
          aria-label="Fading ink"
          title="Fading ink: your marks fade away a few seconds after you stop."
          aria-pressed={tools.fading}
          onClick={() => { setPop(null); tools.selectFade(); }}
          className={cn(btnBase, tools.fading && btnOn)}
        >
          <WandSparkles className="h-[22px] w-[22px]" />
        </button>
        <Separator />
        {PENS.map(swatchButton)}
        <Separator />
        {HIGHLIGHTERS.map(swatchButton)}
        <Separator />
        <button
          type="button"
          aria-label="Straight lines"
          title={tools.straight
            ? "Straight lines are on. Tap to draw freehand again."
            : "Straight lines: draw a straight line in the colour you've picked."}
          aria-pressed={tools.straight}
          onClick={() => { setPop(null); tools.toggleStraight(); }}
          className={cn(btnBase, tools.straight && btnOn)}
        >
          <StraightLineIcon />
        </button>
        <Separator />
        <button
          type="button"
          aria-label="Eraser"
          title={tools.tool === "eraser" ? "Eraser: tap again for sizes (E)" : "Eraser (E)"}
          aria-pressed={tools.tool === "eraser"}
          onClick={(e) => handleEraser(e.currentTarget)}
          className={cn(btnBase, tools.tool === "eraser" && btnOn)}
        >
          <Eraser className="h-[22px] w-[22px]" />
          {tools.tool === "eraser" && <SizeBadge>{tools.eraser === "stroke" ? "Str" : tools.eraser}</SizeBadge>}
        </button>
        <Separator />
        {!compact && (
          <>
            <button type="button" aria-label="Undo" title="Undo (Z)" onClick={() => { setPop(null); onUndo?.(); }} disabled={!onUndo} className={btnBase}>
              <Undo2 className="h-[22px] w-[22px]" />
            </button>
            <button type="button" aria-label="Redo" title="Redo (Shift+Z)" onClick={() => { setPop(null); onRedo?.(); }} disabled={!onRedo} className={btnBase}>
              <Redo2 className="h-[22px] w-[22px]" />
            </button>
            <Separator />
          </>
        )}
        <button
          type="button"
          aria-label="More"
          title="More"
          aria-expanded={pop === "more"}
          onClick={(e) => togglePop("more", e.currentTarget)}
          className={btnBase}
        >
          <Ellipsis className="h-[22px] w-[22px]" />
        </button>
        <button type="button" aria-label="Collapse the tray" title="Collapse the tray" onClick={collapse} className={btnBase}>
          <ChevronsDown className="h-[22px] w-[22px]" />
        </button>
        <TrayEdge side="end" shown={hiddenSides.end} onSlide={() => slideTray(1)} />
      </div>

      {collapsed && (
        <button
          ref={fabRef}
          type="button"
          onClick={expand}
          aria-label={`Open the annotation tray. You are using ${toolName}.`}
          title={`Open the annotation tray. You are using ${toolName}.`}
          className={cn(
            "absolute bottom-4 z-20 grid place-items-center rounded-full pointer-events-auto",
            "bg-[#2e251c] dark:bg-[#3b3025] text-[#f3e7d3] shadow-[0_12px_32px_rgba(46,30,14,0.3)]",
            dock === "left" ? "left-4" : "right-4",
          )}
          style={{ width: FAB, height: FAB }}
        >
          {tools.tool === "hand" ? <Hand className="h-6 w-6" />
            : tools.tool === "eraser" ? <Eraser className="h-6 w-6" />
            : tools.fading ? <WandSparkles className="h-6 w-6" />
            : <SwatchMark swatch={tools.swatch} big className="outline outline-[3px] outline-offset-[3px] outline-[#f3e7d3]" />}
        </button>
      )}

      {pop && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className={cn(
              "z-[200] rounded-[14px] p-1.5 bg-[#2e251c] dark:bg-[#3b3025] text-[#f3e7d3] shadow-[0_12px_32px_rgba(46,30,14,0.35)]",
              pop === "more" ? "flex flex-col min-w-[240px]" : "flex gap-1",
            )}
          >
            {pop === "sizes" && (["S", "M", "L"] as InkSize[]).map((size) => (
              <PopOption
                key={size}
                title={`${SIZE_NAMES[size]} ${tools.swatch.label.toLowerCase()}`}
                on={tools.sizes[tools.swatch.id] === size}
                onClick={() => { tools.setSwatchSize(tools.swatch.id, size); setPop(null); }}
              >
                <SizeSample swatch={tools.swatch} size={size} />
              </PopOption>
            ))}

            {pop === "eraser" && ERASER_CHOICES.map((choice) => (
              <PopOption
                key={choice.value}
                title={choice.title}
                on={tools.eraser === choice.value}
                onClick={() => { tools.setEraser(choice.value); setPop(null); }}
              >
                {choice.circle
                  ? <span className="block rounded-full border-2 border-dashed border-current" style={{ width: choice.circle, height: choice.circle }} />
                  : <span className="text-xs font-bold">Stroke</span>}
              </PopOption>
            ))}

            {pop === "more" && (
              <>
                {/* In the compact tray, undo and redo live here. The menu stays
                    open after each tap, so several steps can be undone in a row. */}
                {compact && (
                  <div className="grid grid-cols-2 gap-1 pb-1 mb-1 border-b border-[#4a3c2e] dark:border-[#5a4a39]">
                    <MenuRow icon={<Undo2 className="h-5 w-5" />} label="Undo" disabled={!onUndo} onClick={() => onUndo?.()} />
                    <MenuRow icon={<Redo2 className="h-5 w-5" />} label="Redo" disabled={!onRedo} onClick={() => onRedo?.()} />
                  </div>
                )}
                <MenuRow
                  icon={inkHidden ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                  label={inkHidden ? "Show ink" : "Hide ink"}
                  hint={inkHidden ? "Your ink is only hidden, not deleted." : undefined}
                  onClick={() => { onInkHiddenChange(!inkHidden); setPop(null); }}
                />
                {onClearPage && pageInView && (
                  <MenuRow
                    danger
                    icon={<Trash2 className="h-5 w-5" />}
                    label="Clear this page"
                    hint={`Page ${pageInView.number}`}
                    disabled={!pageInView.hasInk}
                    onClick={() => {
                      setPop(null);
                      onClearPage();
                      offerUndo(`Page ${pageInView.number} was cleared.`);
                    }}
                  />
                )}
                {onClearAll && (
                  <MenuRow
                    danger
                    icon={<Trash2 className="h-5 w-5" />}
                    label="Clear all ink"
                    disabled={!hasInk}
                    onClick={() => {
                      setPop(null);
                      onClearAll();
                      offerUndo("All the ink on this exercise was cleared.");
                    }}
                  />
                )}
                {onSaveAnnotated && (
                  <MenuRow
                    icon={<Download className="h-5 w-5" />}
                    label="Save annotated PDF"
                    hint={hasInk ? undefined : "Draw on the worksheet first."}
                    disabled={!hasInk}
                    onClick={() => { setPop(null); onSaveAnnotated(); }}
                  />
                )}
              </>
            )}
          </div>
        </FloatingPortal>
      )}

      {undoOffer && !collapsed && (
        <FloatingPortal>
          <UndoOfferBar
            message={undoOffer}
            onUndo={onUndo && (() => { dropUndoOffer(); onUndo(); })}
            floatingRef={offerFloating.refs.setFloating}
            style={offerFloating.floatingStyles}
          />
        </FloatingPortal>
      )}
    </>
  );
}

/**
 * The fade and arrow at one end of the tray while tools are out of sight
 * there. It takes no room in the row. It sticks to the tray's edge and
 * spreads over the tools beside it, so the tray never changes width when it
 * comes and goes. The negative margin gives back the row's gap beside it.
 */
function TrayEdge({ side, shown, onSlide }: { side: "start" | "end"; shown: boolean; onSlide: () => void }) {
  const start = side === "start";
  return (
    <div className={cn("sticky z-10 w-0 self-stretch flex-none", start ? "left-0 -mr-1" : "right-0 -ml-1", !shown && "invisible")}>
      <div
        className={cn(
          // It reaches past its edge into the tray's padding, and the tray's rounded edge clips it.
          "absolute -inset-y-1.5 w-16 flex items-center from-[#2e251c] from-45% to-transparent dark:from-[#3b3025]",
          start ? "-left-1.5 justify-start pl-1.5 bg-gradient-to-r" : "-right-1.5 justify-end pr-1.5 bg-gradient-to-l",
        )}
      >
        <button
          type="button"
          aria-label={start ? "Show the tools at the start" : "Show the rest of the tools"}
          title={start ? "Show the tools at the start" : "Show the rest of the tools"}
          onClick={onSlide}
          className="w-9 h-12 grid place-items-center rounded-[12px] text-[#f3e7d3] hover:bg-[#f3e7d3]/10"
        >
          {start ? <ChevronLeft className="h-6 w-6" /> : <ChevronRight className="h-6 w-6" />}
        </button>
      </div>
    </div>
  );
}

/** A line with a dot at each end, for the Straight lines button. */
function StraightLineIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="5.5" y1="18.5" x2="18.5" y2="5.5" />
      <circle cx="5" cy="19" r="2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="5" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SizeBadge({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[9px] font-bold tracking-wide opacity-80 leading-none">
      {children}
    </span>
  );
}

function SizeSample({ swatch, size }: { swatch: InkSwatch; size: InkSize }) {
  if (swatch.kind === "pen") {
    const d = { S: 6, M: 11, L: 18 }[size];
    return <span className="block rounded-full shadow-[0_0_0_2px_rgba(243,231,211,0.35)]" style={{ width: d, height: d, backgroundColor: swatch.color }} />;
  }
  // The bar's height follows the highlighter's real width, scaled down to fit.
  const h = Math.round(INK_SIZES.highlighter[size] * 0.8);
  return <span className="block w-[34px] rounded-[3px] opacity-80" style={{ height: h, backgroundColor: swatch.color }} />;
}

function PopOption({ title, on, onClick, children }: { title: string; on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "w-14 h-14 rounded-[10px] grid place-items-center text-[#f3e7d3] transition-colors hover:bg-[#f3e7d3]/10",
        on && "bg-[#f3e7d3]/20 outline outline-2 outline-[#f3e7d3]",
      )}
    >
      {children}
    </button>
  );
}

function MenuRow({
  icon, label, hint, onClick, disabled = false, danger = false,
}: { icon: ReactNode; label: string; hint?: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-3 min-h-12 px-3.5 py-2 rounded-[10px] text-left font-medium text-sm transition-colors",
        "hover:bg-[#f3e7d3]/10 disabled:opacity-45 disabled:hover:bg-transparent",
        danger ? "text-[#ffb4a8]" : "text-[#f3e7d3]",
      )}
    >
      {icon}
      <span>
        {label}
        {hint && <small className="block font-normal text-xs opacity-70">{hint}</small>}
      </span>
    </button>
  );
}
