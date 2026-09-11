"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Hand, Eraser, Undo2, Redo2, Ellipsis, ChevronsDown, GripVertical,
  Eye, EyeOff, Trash2, Download,
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
  onSaveAnnotated?: () => void;
}

// Where each browser left its tray, so the board in each room keeps its own.
const STORAGE_KEY = "csm_annotation_tray";
const MARGIN = 16;
// The round button the tray collapses into is as tall as the tray itself,
// which is what lets the tray morph into it.
const FAB = 60;
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
 * every annotation tool. It never changes width, so its buttons stay put
 * whatever is picked. Tapping the colour or eraser that's already picked opens
 * its sizes above the tray. It can be dragged to the left, middle or right,
 * and collapsed into a round button in its corner.
 */
export function AnnotationTray({
  tools, onUndo, onRedo, inkHidden, onInkHiddenChange, hasInk, onClearAll, onSaveAnnotated,
}: AnnotationTrayProps) {
  const [{ dock, collapsed }, setTrayState] = useState(readTrayState);
  const [morphing, setMorphing] = useState(false);
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

  /** Put the tray where its dock says, leaving the side margin free. */
  const place = useCallback(() => {
    const tray = trayRef.current;
    if (!tray || dragRef.current) return;
    const width = areaWidth();
    const left = dock === "left" ? MARGIN : dock === "right" ? width - tray.offsetWidth - MARGIN : (width - tray.offsetWidth) / 2;
    tray.style.left = `${Math.max(MARGIN, left)}px`;
  }, [dock]);

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
  const [clearArmed, setClearArmed] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { refs, floatingStyles, context } = useFloating({
    open: pop !== null,
    onOpenChange: (open) => { if (!open) setPop(null); },
    placement: "top",
    middleware: [offset(10), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const { getFloatingProps } = useInteractions([useDismiss(context)]);

  useEffect(() => {
    if (pop) return;
    setClearArmed(false);
    clearTimeout(clearTimer.current);
  }, [pop]);
  useEffect(() => () => clearTimeout(clearTimer.current), []);

  const togglePop = (next: Pop, anchor: HTMLElement) => {
    if (pop === next) { setPop(null); return; }
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
    anim.onfinish = () => { morphRef.current = null; setMorphing(false); };
  }, [collapsed, place, fabLeft, reducedMotion]);

  useEffect(() => () => morphRef.current?.cancel(), []);

  // ---------- Rendering ----------

  const toolName =
    tools.tool === "hand" ? "the Hand" : tools.tool === "eraser" ? "the eraser" : `the ${tools.swatch.label.toLowerCase()}`;

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
        aria-hidden={collapsed || undefined}
        className={cn(
          "absolute bottom-4 z-20 flex items-center gap-1 p-1.5 rounded-[18px]",
          "bg-[#2e251c] dark:bg-[#3b3025] text-[#f3e7d3]",
          "shadow-[0_12px_32px_rgba(46,30,14,0.3),inset_0_1px_0_rgba(255,255,255,0.06)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.55)]",
          "max-w-[calc(100%-16px)] overflow-x-auto [scrollbar-width:none] touch-none select-none",
          "[&>*]:transition-opacity [&>*]:duration-150",
          morphing && "overflow-hidden [&>*]:opacity-0 [&>*]:duration-75",
          collapsed && "hidden",
        )}
      >
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
        <Separator />
        {PENS.map(swatchButton)}
        <Separator />
        {HIGHLIGHTERS.map(swatchButton)}
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
        <button type="button" aria-label="Undo" title="Undo (Z)" onClick={() => { setPop(null); onUndo?.(); }} disabled={!onUndo} className={btnBase}>
          <Undo2 className="h-[22px] w-[22px]" />
        </button>
        <button type="button" aria-label="Redo" title="Redo (Shift+Z)" onClick={() => { setPop(null); onRedo?.(); }} disabled={!onRedo} className={btnBase}>
          <Redo2 className="h-[22px] w-[22px]" />
        </button>
        <Separator />
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
      </div>

      {collapsed && (
        <button
          ref={fabRef}
          type="button"
          onClick={expand}
          aria-label={`Open the annotation tray. You are using ${toolName}.`}
          title={`Open the annotation tray. You are using ${toolName}.`}
          className={cn(
            "absolute bottom-4 z-20 grid place-items-center rounded-full",
            "bg-[#2e251c] dark:bg-[#3b3025] text-[#f3e7d3] shadow-[0_12px_32px_rgba(46,30,14,0.3)]",
            dock === "left" ? "left-4" : "right-4",
          )}
          style={{ width: FAB, height: FAB }}
        >
          {tools.tool === "hand" ? <Hand className="h-6 w-6" />
            : tools.tool === "eraser" ? <Eraser className="h-6 w-6" />
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
                <MenuRow
                  icon={inkHidden ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                  label={inkHidden ? "Show ink" : "Hide ink"}
                  hint={inkHidden ? "Your ink is only hidden, not deleted." : undefined}
                  onClick={() => { onInkHiddenChange(!inkHidden); setPop(null); }}
                />
                {onClearAll && (
                  <MenuRow
                    danger
                    icon={<Trash2 className="h-5 w-5" />}
                    label={clearArmed ? "Tap again to clear all ink" : "Clear all ink"}
                    hint={clearArmed ? "This removes every mark on this exercise and can't be undone." : undefined}
                    disabled={!hasInk}
                    onClick={() => {
                      if (!clearArmed) {
                        setClearArmed(true);
                        clearTimeout(clearTimer.current);
                        clearTimer.current = setTimeout(() => setClearArmed(false), 3000);
                        return;
                      }
                      setPop(null);
                      onClearAll();
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
    </>
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
