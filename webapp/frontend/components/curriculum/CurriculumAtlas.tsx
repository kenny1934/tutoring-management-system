"use client";

import {
  memo,
  ReactNode,
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Check,
  Clock,
  MapPin,
  Maximize2,
  Minimize2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ATLAS_GRADES,
  collectRelated,
  computeAtlasLayout,
  computeAtlasStatus,
  computeCohortCovered,
  inferSeries,
  type AtlasConceptInput,
  type AtlasEdgeInput,
  type AtlasGrade,
  type AtlasLayout,
  type AtlasSeries,
  type AtlasStatus,
  type AtlasStrand,
  type PositionedNode,
} from "@/lib/curriculum-atlas";
import { conceptDisplayName, conceptNameForStream } from "@/lib/curriculum-labels";
import { iconHitArea, useCoarsePointer } from "@/hooks/useCoarsePointer";
import { useDialogFocus } from "./CurriculumModalShell";
import type { CurriculumTimelineResponse } from "@/types";

const GUTTER_W = 28;
/** Height of the sticky grade header inside the scroll container. */
const HEADER_H = 26;
// Below 0.5 the 11px node labels are illegible anyway.
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;

/** AtlasStatus plus the tier the component synthesises for earlier grades:
 *  topics this cohort covered in a previous year read quieter than this
 *  year's coverage. */
type NodeStatus = AtlasStatus | "covered-past";

const STATUS_LABELS: Record<NodeStatus, string> = {
  covered: "covered",
  "covered-past": "covered in an earlier grade",
  current: "current topic",
  "coming-up": "coming up",
  "no-data": "",
};

// The gutter's vertical labels must fit the shortest row (58px with one
// node), so they stay one word; the full strand name lives in the tooltip.
const STRAND_SHORT: Record<AtlasStrand, string> = {
  number: "Number",
  algebra: "Algebra",
  geometry: "Geometry",
  data: "Data",
};

interface CurriculumAtlasProps {
  concepts: AtlasConceptInput[];
  edges: AtlasEdgeInput[];
  /** Timeline of the selected school-grade; null renders the plain map. */
  timeline: CurriculumTimelineResponse | null;
  /** True while a school's timeline is being fetched. */
  timelineLoading?: boolean;
  /** The same cohort's earlier-grade timelines (F2 last year, F1 the year
   *  before) — paints real coverage on the columns before the selected
   *  grade instead of assuming them done. */
  cohortTimelines?: (CurriculumTimelineResponse | null | undefined)[];
  stream: string | null;
  selectedGrade: string | null;
  isMobile: boolean;
  onOpenFiles: (t: { conceptId: number; name: string }) => void;
}

function statusIcon(status: NodeStatus | undefined) {
  if (status === "covered")
    return <Check className="h-3 w-3 shrink-0 text-teal-600 dark:text-teal-400" />;
  if (status === "covered-past")
    return <Check className="h-3 w-3 shrink-0 text-teal-600/45 dark:text-teal-400/45" />;
  if (status === "current") return <MapPin className="h-3 w-3 shrink-0 text-white" />;
  if (status === "coming-up")
    return <Clock className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />;
  return null;
}

type NodeMode = "normal" | "active" | "related" | "dimmed";

const AtlasNode = memo(function AtlasNode({
  node,
  label,
  title,
  status,
  mode,
  animDelay,
  reduced,
  onHover,
  onLeave,
  onActivate,
}: {
  node: PositionedNode;
  label: string;
  title: string;
  status: NodeStatus | undefined;
  mode: NodeMode;
  animDelay: number;
  reduced: boolean;
  onHover: (id: number) => void;
  onLeave: () => void;
  onActivate: (id: number) => void;
}) {
  const { concept } = node;
  return (
    <motion.div
      className="absolute z-20"
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
      initial={reduced ? false : { opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, delay: animDelay, ease: "easeOut" }}
    >
      {status === "current" && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute -inset-1 rounded-lg ring-2 ring-teal-400/60 animate-pulse motion-reduce:animate-none pointer-events-none",
            "transition-opacity duration-200",
            mode === "dimmed" && "opacity-25"
          )}
        />
      )}
      <button
        type="button"
        title={concept.isExtension ? `${title} (extension topic)` : title}
        aria-label={`${label}, ${concept.grade}${concept.isExtension ? ", extension topic" : ""}${status && STATUS_LABELS[status] ? `, ${STATUS_LABELS[status]}` : ""}`}
        onMouseEnter={() => onHover(concept.id)}
        onMouseLeave={onLeave}
        onFocus={() => onHover(concept.id)}
        onBlur={onLeave}
        onClick={() => onActivate(concept.id)}
        className={cn(
          "relative w-full h-full flex items-center gap-1.5 px-2 text-left text-[11px] leading-tight rounded-md border-2",
          "transition-[opacity,filter,border-color] duration-200",
          // keep keyboard focus visible even when the node is dimmed, and
          // clear of the sticky grade header / strand gutter when tabbing
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500",
          "focus-visible:opacity-100 focus-visible:saturate-100",
          "scroll-mt-[34px] scroll-ml-[36px]",
          concept.isExtension ? "border-dashed" : "",
          status === "current"
            ? "bg-teal-600 dark:bg-teal-500 border-teal-700 dark:border-teal-400 text-white font-semibold"
            : status === "covered"
              ? "bg-teal-100/70 dark:bg-teal-900/30 border-teal-600/60 dark:border-teal-500/60 text-gray-800 dark:text-gray-200"
              : status === "covered-past"
                ? "bg-teal-50/60 dark:bg-teal-900/10 border-teal-600/25 dark:border-teal-500/25 text-gray-600 dark:text-gray-400"
                : status === "coming-up"
                  ? "bg-[#fef9f3] dark:bg-[#2d2618] border-dashed border-amber-500 dark:border-amber-400 text-gray-700 dark:text-gray-300"
                  : "bg-[#fef9f3] dark:bg-[#2d2618] border-[#d4a574]/60 dark:border-[#8b6f47] text-gray-700 dark:text-gray-300 hover:border-[#d4a574] dark:hover:border-[#8b6f47]",
          mode === "dimmed" && "opacity-25 saturate-50"
        )}
      >
        <span className="flex-1 truncate">{label}</span>
        {statusIcon(status)}
      </button>
    </motion.div>
  );
});

const AtlasEdges = memo(function AtlasEdges({
  layout,
  series,
  relatedEdges,
  hasActive,
  reduced,
}: {
  layout: AtlasLayout;
  series: AtlasSeries;
  // relatedEdges is rebuilt per active node, so its identity already
  // invalidates the memo whenever the highlight changes.
  relatedEdges: Set<string> | null;
  hasActive: boolean;
  reduced: boolean;
}) {
  return (
    <svg
      width={layout.grid.width}
      height={layout.grid.height}
      className="absolute inset-0 z-10 pointer-events-none"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="atlas-arrow"
          markerUnits="userSpaceOnUse"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L8,4 L0,8 z" className="fill-[#c49a68] dark:fill-[#8b6f47]" />
        </marker>
        <marker
          id="atlas-arrow-hi"
          markerUnits="userSpaceOnUse"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L8,4 L0,8 z" className="fill-teal-500 dark:fill-teal-400" />
        </marker>
      </defs>
      {/* keyed by series so toggling replays the draw-in */}
      <g key={series}>
        {layout.edges.map((e, i) => {
          const hi = relatedEdges?.has(`${e.fromId}>${e.toId}`) ?? false;
          return (
            <motion.path
              key={`${e.fromId}>${e.toId}`}
              d={e.d}
              fill="none"
              strokeWidth={hi ? 2.2 : e.kind === "skip" ? 1.2 : 1.5}
              markerEnd={hi ? "url(#atlas-arrow-hi)" : "url(#atlas-arrow)"}
              className={cn(
                "transition-opacity duration-200",
                hi
                  ? "stroke-teal-500 dark:stroke-teal-400 opacity-100"
                  : "stroke-[#c49a68] dark:stroke-[#8b6f47]",
                !hi && (hasActive ? "opacity-[0.08]" : e.kind === "skip" ? "opacity-30" : "opacity-55")
              )}
              initial={reduced ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.55, delay: 0.4 + i * 0.015, ease: "easeOut" }}
            />
          );
        })}
      </g>
    </svg>
  );
});

/** Full-viewport shell for the fullscreen map: same dialog semantics as the
 *  curriculum modals (focus capture and restore, Tab trapping); Escape is
 *  handled by CurriculumAtlas so a stacked worksheet dialog wins the press. */
function AtlasFullscreenOverlay({ children }: { children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const trapTab = useDialogFocus(panelRef);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Concept map in fullscreen"
      tabIndex={-1}
      onKeyDown={trapTab}
      // z-[9990]: above the page, below the curriculum modals (10000) so a
      // topic's worksheet list opened from the map stacks on top.
      className="fixed inset-0 z-[9990] flex flex-col bg-[#fef9f3] dark:bg-[#2d2618] focus:outline-none"
    >
      {children}
    </div>,
    document.body
  );
}

function minimapFill(status: NodeStatus | undefined): string {
  if (status === "current") return "fill-teal-600 dark:fill-teal-500";
  if (status === "covered") return "fill-teal-500/60 dark:fill-teal-400/50";
  if (status === "covered-past") return "fill-teal-500/25 dark:fill-teal-400/20";
  if (status === "coming-up") return "fill-amber-400/70 dark:fill-amber-500/60";
  return "fill-[#d4a574]/35 dark:fill-[#8b6f47]/50";
}

/** Overview inset shown while the map overflows its viewport: node rectangles
 *  in their status colours plus a draggable frame for the visible region. It
 *  owns its scroll subscription so panning never re-renders the map itself. */
const AtlasMinimap = memo(function AtlasMinimap({
  layout,
  nodeStatus,
  zoom,
  scrollRef,
  fullscreen,
}: {
  layout: AtlasLayout;
  nodeStatus: (n: PositionedNode) => NodeStatus | undefined;
  zoom: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Only consumed to resubscribe when the scroll container remounts. */
  fullscreen: boolean;
}) {
  const [view, setView] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    needed: boolean;
  } | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const needed =
        GUTTER_W + layout.grid.width * zoom > el.clientWidth + 4 ||
        HEADER_H + layout.grid.height * zoom > el.clientHeight + 4;
      // The sticky gutter and header cover the container's first 28x26px, so
      // the truly visible canvas region starts right at scroll/zoom.
      const w = Math.max(0, el.clientWidth - GUTTER_W) / zoom;
      const h = Math.max(0, el.clientHeight - HEADER_H) / zoom;
      setView({
        x: Math.min(Math.max(0, el.scrollLeft / zoom), Math.max(0, layout.grid.width - w)),
        y: Math.min(Math.max(0, el.scrollTop / zoom), Math.max(0, layout.grid.height - h)),
        w: Math.min(w, layout.grid.width),
        h: Math.min(h, layout.grid.height),
        needed,
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(onScroll) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      observer?.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scrollRef, layout, zoom, fullscreen]);

  const centerOn = (e: React.PointerEvent<SVGSVGElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const lx = ((e.clientX - rect.left) / rect.width) * layout.grid.width;
    const ly = ((e.clientY - rect.top) / rect.height) * layout.grid.height;
    el.scrollLeft = lx * zoom - (el.clientWidth - GUTTER_W) / 2;
    el.scrollTop = ly * zoom - (el.clientHeight - HEADER_H) / 2;
  };

  if (!view || !view.needed) return null;

  const mmW = 140;
  const mmH = Math.max(48, Math.min(160, (mmW * layout.grid.height) / layout.grid.width));

  return (
    <div
      aria-hidden="true"
      className="absolute bottom-3 right-3 z-40 hidden sm:block rounded-md border border-[#d4a574]/60 dark:border-[#8b6f47] bg-[#fef9f3]/95 dark:bg-[#2d2618]/95 shadow-md overflow-hidden"
    >
      <svg
        width={mmW}
        height={mmH}
        viewBox={`0 0 ${layout.grid.width} ${layout.grid.height}`}
        preserveAspectRatio="none"
        className="block cursor-pointer touch-none"
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          centerOn(e);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) centerOn(e);
        }}
        onPointerUp={() => (draggingRef.current = false)}
        onPointerCancel={() => (draggingRef.current = false)}
      >
        {layout.nodes.map((n) => (
          <rect
            key={n.concept.id}
            x={n.x}
            y={n.y}
            width={n.w}
            height={n.h}
            rx={6}
            className={minimapFill(nodeStatus(n))}
          />
        ))}
        <rect
          x={view.x}
          y={view.y}
          width={view.w}
          height={view.h}
          fill="none"
          strokeWidth={(layout.grid.width / mmW) * 1.5}
          className="stroke-teal-600 dark:stroke-teal-400"
        />
      </svg>
    </div>
  );
});

export function CurriculumAtlas({
  concepts,
  edges,
  timeline,
  timelineLoading,
  cohortTimelines,
  stream,
  selectedGrade,
  isMobile,
  onOpenFiles,
}: CurriculumAtlasProps) {
  const reduced = useReducedMotion() ?? false;
  const scrollRef = useRef<HTMLDivElement>(null);
  const coarsePointer = useCoarsePointer();
  const twoStageTap = isMobile || coarsePointer;
  const hitArea = iconHitArea(coarsePointer);

  const [fullscreen, setFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Keeps the page's layout (and scroll position) intact behind the overlay.
  const [placeholderH, setPlaceholderH] = useState(0);
  // The inline fullscreen button unmounts when the map moves into the portal,
  // so the dialog's usual focus restore lands on a detached node; hand focus
  // to the fresh toggle button ourselves on the way out.
  const fullscreenBtnRef = useRef<HTMLButtonElement>(null);
  const wasFullscreen = useRef(false);
  useEffect(() => {
    if (wasFullscreen.current && !fullscreen) fullscreenBtnRef.current?.focus();
    wasFullscreen.current = fullscreen;
  }, [fullscreen]);
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  // Fill the viewport below the card's top edge instead of a fixed cap, so
  // tall screens see the whole map without an inner scroll. The body observer
  // re-measures when content above the map reflows (toolbar wrap, legend
  // appearing); equal values bail out of setState, so no feedback loop.
  const [maxH, setMaxH] = useState<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // The app scrolls inside LayoutShell's <main>, not the window, so both
    // the height budget and the card's offset must come from the scrollable
    // ancestor. (In fullscreen the portal has none; the window fallback runs
    // but maxH is unused there and recomputed on exit.)
    let scroller: HTMLElement | null = null;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if (o === "auto" || o === "scroll") {
        scroller = p;
        break;
      }
    }
    const compute = () => {
      // Offset within the scrolling content, not the viewport: a viewport-
      // relative reading raced the view switch's scroll reset when the map
      // mounted mid-scroll and ballooned it taller than the viewport.
      const top = Math.max(
        0,
        scroller
          ? el.getBoundingClientRect().top -
              scroller.getBoundingClientRect().top +
              scroller.scrollTop
          : el.getBoundingClientRect().top + window.scrollY
      );
      const budget = scroller ? scroller.clientHeight : window.innerHeight;
      setMaxH(Math.max(320, budget - top - 16));
    };
    compute();
    window.addEventListener("resize", compute);
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(compute) : null;
    observer?.observe(document.body);
    if (scroller) observer?.observe(scroller);
    return () => {
      window.removeEventListener("resize", compute);
      observer?.disconnect();
    };
    // fullscreen: remeasure against the inline container after exiting.
  }, [fullscreen]);

  // Zoom scales the canvas (nodes, edges, row stripes) with a transform while
  // the sticky header and gutter stay unscaled and reposition by the factor,
  // so native scrolling and the sticky chrome keep working at any zoom.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  // Scroll correction for a zoom change has to land after the resized canvas
  // commits, so the handler parks it here for the layout effect below.
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);

  const applyZoom = useCallback(
    (
      next: number | ((prev: number) => number),
      anchor?: { vx: number; vy: number } | "origin"
    ) => {
      const el = scrollRef.current;
      setZoom((prev) => {
        const z = Math.min(
          ZOOM_MAX,
          Math.max(ZOOM_MIN, typeof next === "function" ? next(prev) : next)
        );
        if (el && z !== prev) {
          if (anchor === "origin") {
            pendingScroll.current = { left: 0, top: 0 };
          } else {
            // Keep the anchored point (cursor, or viewport centre) still: map
            // it to canvas coordinates at the old zoom, back at the new one.
            const vx = anchor?.vx ?? el.clientWidth / 2;
            const vy = anchor?.vy ?? el.clientHeight / 2;
            const cx = (el.scrollLeft + vx - GUTTER_W) / prev;
            const cy = (el.scrollTop + vy - HEADER_H) / prev;
            pendingScroll.current = {
              left: GUTTER_W + cx * z - vx,
              top: HEADER_H + cy * z - vy,
            };
          }
        }
        return z;
      });
    },
    []
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pendingScroll.current) {
      el.scrollLeft = Math.max(0, pendingScroll.current.left);
      el.scrollTop = Math.max(0, pendingScroll.current.top);
      pendingScroll.current = null;
    }
  }, [zoom]);

  // Ctrl+scroll and trackpad pinch zoom around the cursor. Native: React
  // attaches wheel listeners passively, so preventDefault (needed to stop the
  // browser's page zoom) only works on a listener we add ourselves.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const rect = el.getBoundingClientRect();
      applyZoom((prev) => prev * Math.exp(-dy * 0.0015), {
        vx: e.clientX - rect.left,
        vy: e.clientY - rect.top,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // fullscreen: the container remounts, so the listener must reattach.
  }, [applyZoom, fullscreen]);

  // Mouse drag on empty map space pans (touch keeps native scroll panning).
  const dragRef = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  // A drag ends with a click on whatever the pointer happens to be over;
  // swallow that one so panning never clears the selection.
  const suppressClickRef = useRef(false);

  const onPanStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
      moved: false,
    };
  };
  const onPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d || !el || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.abs(dx) + Math.abs(dy) < 4) return; // still a click
      d.moved = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(d.id);
    }
    el.scrollLeft = d.left - dx;
    el.scrollTop = d.top - dy;
  };
  const onPanEnd = () => {
    if (dragRef.current?.moved) {
      suppressClickRef.current = true;
      // The click fires synchronously after pointerup; clear the flag right
      // after so a stray drag with no click can't swallow the next real one.
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    dragRef.current = null;
    setDragging(false);
  };

  // The school's series is inferred from its timeline but stays togglable;
  // switching school clears the override.
  const timelineKey = timeline ? `${timeline.school}||${timeline.grade}` : null;
  const [seriesOverride, setSeriesOverride] = useState<AtlasSeries | null>(null);
  useEffect(() => {
    setSeriesOverride(null);
  }, [timelineKey]);
  const inferredSeries = useMemo(() => {
    if (!timeline) return "HK" as AtlasSeries;
    const ids = timeline.weeks.flatMap((w) => w.concepts.map((c) => c.concept_id));
    ids.push(...timeline.pacing.map((p) => p.concept_id));
    return inferSeries(ids, concepts);
  }, [timeline, concepts]);
  const series = seriesOverride ?? inferredSeries;

  const layout = useMemo(
    () => computeAtlasLayout(concepts, edges, series),
    [concepts, edges, series]
  );

  const fitZoom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Inline, the container shrinks to short content, so its own height is
    // not the available space; the viewport-fill budget is.
    const availH = (fullscreen ? el.clientHeight : (maxH ?? 544)) - HEADER_H;
    applyZoom(
      Math.min(
        (el.clientWidth - GUTTER_W) / layout.grid.width,
        availH / layout.grid.height
      ),
      "origin"
    );
    el.scrollTo({ left: 0, top: 0 });
  }, [applyZoom, layout, fullscreen, maxH]);

  const statusMap = useMemo(
    () =>
      timeline
        ? computeAtlasStatus(timeline.weeks, timeline.current_week, timeline.pacing)
        : new Map<number, AtlasStatus>(),
    [timeline]
  );
  // The school's observations belong to its own series' concepts, so a
  // toggled-away map would paint almost nothing — suppress the overlay and
  // point back instead. Grades past F3 have no column to paint.
  const offSeries = !!timeline && statusMap.size > 0 && series !== inferredSeries;
  const overlayActive =
    statusMap.size > 0 &&
    !!selectedGrade &&
    ATLAS_GRADES.includes(selectedGrade as AtlasGrade) &&
    !offSeries;
  const selectedCol = overlayActive
    ? ATLAS_GRADES.indexOf(selectedGrade as AtlasGrade)
    : -1;
  const cohortCovered = useMemo(
    () =>
      computeCohortCovered(
        (cohortTimelines ?? [])
          .filter((t): t is CurriculumTimelineResponse => !!t)
          .map((t) => t.weeks)
      ),
    [cohortTimelines]
  );

  // focus = hover/keyboard (transient); selected = tap (sticky, mobile).
  const [focusId, setFocusId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  useEffect(() => {
    setSelectedId(null);
    setFocusId(null);
  }, [series]);
  const activeId = selectedId ?? focusId;

  // Fullscreen Escape: clear a sticky selection first, then exit. Capture
  // phase and window-level because clicking empty map space parks focus on
  // the body, out of reach of the overlay's own keydown. A stacked worksheet
  // or preview dialog (marked data-curriculum-overlay) owns the press.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector("[data-curriculum-overlay]")) return;
      if (selectedId != null) {
        setSelectedId(null);
        setFocusId(null);
      } else {
        setFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [fullscreen, selectedId]);

  const related = useMemo(
    () => (activeId != null ? collectRelated(layout, activeId) : null),
    [layout, activeId]
  );

  const handleLeave = useCallback(() => setFocusId(null), []);
  const activate = useCallback(
    (id: number) => {
      const node = layout.nodesById.get(id);
      if (!node) return;
      if (twoStageTap && selectedId !== id) {
        setSelectedId(id);
        return;
      }
      onOpenFiles({
        conceptId: id,
        name: conceptNameForStream(node.concept, stream),
      });
    },
    [layout, twoStageTap, selectedId, stream, onOpenFiles]
  );

  const nodeStatus = useCallback(
    (n: PositionedNode): NodeStatus | undefined =>
      // Selected grade gets the full tier set; earlier grades show the
      // cohort's own recorded coverage from previous years.
      overlayActive && n.concept.grade === selectedGrade
        ? statusMap.get(n.concept.id) ?? "no-data"
        : overlayActive && n.col < selectedCol && cohortCovered.has(n.concept.id)
          ? "covered-past"
          : undefined,
    [overlayActive, selectedGrade, statusMap, selectedCol, cohortCovered]
  );

  // Land panned to the selected grade's column (or F1 without a school).
  // zoomRef, not zoom: zoom changes anchor their own scroll correction.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const col = layout.grid.columns.find((c) => c.grade === selectedGrade);
    if (!col) {
      el.scrollTo({ left: 0 });
      return;
    }
    el.scrollTo({
      left: Math.max(
        0,
        GUTTER_W + (col.x + col.width / 2) * zoomRef.current - el.clientWidth / 2
      ),
    });
    // fullscreen: the container remounts on toggle, so re-centre in it.
  }, [layout, selectedGrade, series, fullscreen]);

  const selectedNode = selectedId != null ? layout.nodesById.get(selectedId) : null;
  const scaledW = Math.round(layout.grid.width * zoom);
  const scaledH = Math.round(layout.grid.height * zoom);
  const innerMinWidth = GUTTER_W + scaledW;

  const iconBtn =
    "rounded text-gray-400 hover:text-teal-600 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors disabled:opacity-40 disabled:hover:text-gray-400 disabled:hover:bg-transparent";

  const body = (
    <div
      ref={rootRef}
      className={cn(fullscreen && "flex-1 min-h-0 flex flex-col")}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setSelectedId(null);
          setFocusId(null);
        }
      }}
    >
      {/* Card header: series toggle + legend / hint + zoom and fullscreen */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 px-4 py-2 border-b border-[#d4a574]/40 dark:border-[#8b6f47]/60 bg-gradient-to-r from-teal-50 to-[#fef9f3] dark:from-teal-900/20 dark:to-[#2d2618]",
          fullscreen && "shrink-0"
        )}
      >
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
          Concept map
        </span>
        <div className="flex gap-1" role="group" aria-label="Series">
          {(["HK", "MAS"] as AtlasSeries[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={series === s}
              onClick={() => setSeriesOverride(s)}
              className={cn(
                "text-[10px] font-semibold px-2.5 py-0.5 rounded-full border transition-colors",
                series === s
                  ? "bg-teal-600 dark:bg-teal-500 border-teal-600 dark:border-teal-500 text-white"
                  : "border-[#d4a574]/50 dark:border-[#8b6f47]/70 text-gray-500 dark:text-gray-400 hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400"
              )}
            >
              {s} series
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2.5 flex-wrap">
          {overlayActive ? (
            <>
              <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                <span className="inline-block w-3.5 h-2.5 rounded-sm bg-teal-100/70 dark:bg-teal-900/30 border border-teal-600/60" />
                Covered
              </span>
              {cohortCovered.size > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                  <span className="inline-block w-3.5 h-2.5 rounded-sm bg-teal-50/60 dark:bg-teal-900/10 border border-teal-600/25" />
                  Covered in earlier years
                </span>
              )}
              <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                <span className="inline-block w-3.5 h-2.5 rounded-sm bg-teal-600 dark:bg-teal-500 border border-teal-700" />
                Current
              </span>
              <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                <span className="inline-block w-3.5 h-2.5 rounded-sm border border-dashed border-amber-500" />
                Coming up
              </span>
              <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                <span className="inline-block w-3.5 h-2.5 rounded-sm border border-[#d4a574]/50 dark:border-[#8b6f47]/70" />
                No data
              </span>
            </>
          ) : (
            <span className="text-[10px] text-gray-400">
              {timelineLoading
                ? "Loading this school's progress…"
                : offSeries
                  ? `Switch back to the ${inferredSeries} series to see this school's progress`
                  : timeline && timeline.current_week == null && timeline.weeks.length > 0
                    ? "Progress is shown for the current school year only"
                    : timeline
                      ? "No weekly records yet, so the map shows the syllabus without progress"
                      : "Pick a school above to see its progress on the map"}
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
            <span className="inline-block w-3.5 h-2.5 rounded-sm border border-dashed border-[#d4a574] dark:border-[#8b6f47]" />
            Extension
          </span>
        </div>
        <div className="flex items-center gap-0.5 pl-2 border-l border-[#d4a574]/40 dark:border-[#8b6f47]/60">
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={zoom <= ZOOM_MIN + 0.001}
            onClick={() => applyZoom((z) => z / 1.25)}
            className={cn(hitArea, iconBtn)}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Reset the zoom to 100%. You can also hold Ctrl and scroll on the map to zoom."
            onClick={() => applyZoom(1)}
            className="w-9 text-center text-[10px] tabular-nums text-gray-500 dark:text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={zoom >= ZOOM_MAX - 0.001}
            onClick={() => applyZoom((z) => z * 1.25)}
            className={cn(hitArea, iconBtn)}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Fit the whole map on screen"
            onClick={fitZoom}
            className="px-1 text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
          >
            Fit
          </button>
          <button
            ref={fullscreenBtnRef}
            type="button"
            aria-label={fullscreen ? "Exit fullscreen" : "View the map fullscreen"}
            title={fullscreen ? "Exit fullscreen" : "View the map fullscreen"}
            onClick={() => {
              if (fullscreen) {
                setFullscreen(false);
              } else {
                setPlaceholderH(rootRef.current?.offsetHeight ?? 0);
                setFullscreen(true);
              }
            }}
            className={cn(hitArea, iconBtn)}
          >
            {fullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      <div className={cn("relative", fullscreen && "flex-1 min-h-0")}>
      <div
        className={cn(
          "overflow-auto overscroll-contain",
          fullscreen && "h-full",
          dragging ? "cursor-grabbing select-none" : !coarsePointer && "cursor-grab"
        )}
        style={fullscreen ? undefined : { maxHeight: maxH ?? 544 }}
        ref={scrollRef}
        onPointerDown={onPanStart}
        onPointerMove={onPanMove}
        onPointerUp={onPanEnd}
        onPointerCancel={onPanEnd}
        onClick={(e) => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          // Tapping empty map space clears the selection (buttons handle
          // their own clicks).
          if ((e.target as HTMLElement).closest("button")) return;
          setSelectedId(null);
          setFocusId(null);
        }}
      >
        {/* Grade header (sticky top, with a sticky corner over the gutter) */}
        <div
          className="sticky top-0 z-40 flex h-[26px] bg-[#fef9f3] dark:bg-[#2d2618] border-b border-[#d4a574]/20 dark:border-[#8b6f47]/30"
          style={{ minWidth: innerMinWidth }}
        >
          <div
            className="sticky left-0 z-40 shrink-0 bg-[#fef9f3] dark:bg-[#2d2618]"
            style={{ width: GUTTER_W }}
          />
          {/* Label positions track the zoom; the labels themselves stay
              full-size so the chrome reads at any scale. */}
          <div className="relative" style={{ width: scaledW }}>
            {layout.grid.columns.map((c, i) => (
              <span
                key={c.grade}
                className={cn(
                  "absolute top-0 h-full flex items-center justify-center text-[10px] font-bold uppercase tracking-widest",
                  c.grade === selectedGrade && overlayActive
                    ? "text-teal-600 dark:text-teal-400"
                    : "text-gray-400"
                )}
                style={{ left: c.x * zoom, width: c.width * zoom }}
              >
                {c.grade}
                {i < layout.grid.columns.length - 1 && (
                  <span className="absolute right-0 translate-x-1/2 text-gray-300 dark:text-gray-600">
                    ›
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>

        <div className="flex" style={{ minWidth: innerMinWidth }}>
          {/* Strand gutter — in flow so sticky-left survives 2-D panning;
              z-30 so panned nodes (z-20) pass under it */}
          <div
            className="sticky left-0 z-30 shrink-0 bg-[#fef9f3] dark:bg-[#2d2618]"
            style={{ width: GUTTER_W }}
          >
            {layout.grid.rows.map((r, i) => (
              <div
                key={r.strand}
                className="flex items-start justify-center pt-2 overflow-hidden"
                style={{
                  height:
                    (r.height + (i < layout.grid.rows.length - 1 ? 16 : 0)) * zoom,
                }}
              >
                <span
                  className="text-[9px] uppercase tracking-widest text-gray-400"
                  style={{ writingMode: "vertical-rl" }}
                  title={r.label}
                >
                  {STRAND_SHORT[r.strand]}
                </span>
              </div>
            ))}
          </div>

          {/* Canvas — the outer box takes the scaled footprint so the native
              scrollbars stay honest; the inner wrapper holds the logical
              layout and applies the zoom as a single transform. */}
          <div
            role="group"
            aria-label="Curriculum concept map"
            className="relative shrink-0"
            style={{ width: scaledW, height: scaledH }}
          >
            <div
              className="absolute left-0 top-0"
              style={{
                width: layout.grid.width,
                height: layout.grid.height,
                transform: `scale(${zoom})`,
                transformOrigin: "0 0",
              }}
            >
            {layout.grid.rows.map((r, i) => (
              <div
                key={r.strand}
                aria-hidden="true"
                className={cn(
                  "absolute left-0 right-0 border-b border-[#d4a574]/15 dark:border-[#8b6f47]/25",
                  i % 2 === 1 && "bg-black/[0.02] dark:bg-white/[0.02]"
                )}
                style={{
                  top: r.y,
                  height: r.height + (i < layout.grid.rows.length - 1 ? 16 : 0),
                }}
              />
            ))}

            <AtlasEdges
              layout={layout}
              series={series}
              relatedEdges={related?.edges ?? null}
              hasActive={activeId != null}
              reduced={reduced}
            />

            {layout.nodes.map((n) => {
              const status = nodeStatus(n);
              const mode: NodeMode =
                activeId == null
                  ? "normal"
                  : n.concept.id === activeId
                    ? "active"
                    : related?.nodes.has(n.concept.id)
                      ? "related"
                      : "dimmed";
              return (
                <AtlasNode
                  key={`${series}-${n.concept.id}`}
                  node={n}
                  label={conceptNameForStream(n.concept, stream)}
                  title={conceptDisplayName(n.concept)}
                  status={status}
                  mode={mode}
                  animDelay={reduced ? 0 : 0.06 * n.col + 0.025 * n.indexInCell}
                  reduced={reduced}
                  onHover={setFocusId}
                  onLeave={handleLeave}
                  onActivate={activate}
                />
              );
            })}
            </div>
          </div>
        </div>
      </div>
      <AtlasMinimap
        layout={layout}
        nodeStatus={nodeStatus}
        zoom={zoom}
        scrollRef={scrollRef}
        fullscreen={fullscreen}
      />
      </div>

      {/* Mobile two-stage selection: tap shows the chain + this strip, second
          tap (or the button) opens the worksheets */}
      {twoStageTap && selectedNode && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-[#d4a574]/40 dark:border-[#8b6f47]/60 text-xs">
          <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-200">
            {conceptNameForStream(selectedNode.concept, stream)}
            <span className="text-gray-400">
              {" · needs "}
              {layout.preds.get(selectedNode.concept.id)?.length || 0}
              {" · unlocks "}
              {layout.succs.get(selectedNode.concept.id)?.length || 0}
            </span>
          </span>
          <button
            type="button"
            onClick={() =>
              onOpenFiles({
                conceptId: selectedNode.concept.id,
                name: conceptNameForStream(selectedNode.concept, stream),
              })
            }
            className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-teal-600 dark:bg-teal-500 text-white"
          >
            Worksheets
          </button>
          <button
            type="button"
            aria-label="Clear selection"
            onClick={() => setSelectedId(null)}
            className="shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );

  if (!fullscreen) return body;

  return (
    <>
      {/* Holds the card's footprint so the page behind the overlay keeps its
          layout and scroll position while the map lives in the portal. */}
      <div style={{ height: placeholderH }} aria-hidden="true" />
      <AtlasFullscreenOverlay>{body}</AtlasFullscreenOverlay>
    </>
  );
}
