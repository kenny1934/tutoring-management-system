"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Clock, MapPin, X } from "lucide-react";
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
import type { CurriculumTimelineResponse } from "@/types";

const GUTTER_W = 28;

const STATUS_LABELS: Record<AtlasStatus, string> = {
  covered: "covered",
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

/** Touch tablets are wider than the mobile breakpoint but still have no
 *  hover, so the two-stage tap keys off the pointer, not the width. */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return coarse;
}

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

function statusIcon(status: AtlasStatus | undefined) {
  if (status === "covered")
    return <Check className="h-3 w-3 shrink-0 text-teal-600 dark:text-teal-400" />;
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
  status: AtlasStatus | undefined;
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
  highlightKey,
  relatedEdges,
  hasActive,
  reduced,
}: {
  layout: AtlasLayout;
  series: AtlasSeries;
  highlightKey: string;
  relatedEdges: Set<string> | null;
  hasActive: boolean;
  reduced: boolean;
}) {
  void highlightKey; // memo comparison input — the sets are rebuilt per active node
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

  // Fill the viewport below the card's top edge instead of a fixed cap, so
  // tall screens see the whole map without an inner scroll. The body observer
  // re-measures when content above the map reflows (toolbar wrap, legend
  // appearing); equal values bail out of setState, so no feedback loop.
  const [maxH, setMaxH] = useState<number | null>(null);
  useEffect(() => {
    const compute = () => {
      const el = scrollRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setMaxH(Math.max(320, window.innerHeight - top - 16));
    };
    compute();
    window.addEventListener("resize", compute);
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(compute) : null;
    observer?.observe(document.body);
    return () => {
      window.removeEventListener("resize", compute);
      observer?.disconnect();
    };
  }, []);

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

  // Land panned to the selected grade's column (or F1 without a school).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const col = layout.grid.columns.find((c) => c.grade === selectedGrade);
    if (!col) {
      el.scrollTo({ left: 0 });
      return;
    }
    el.scrollTo({
      left: Math.max(0, GUTTER_W + col.x + col.width / 2 - el.clientWidth / 2),
    });
  }, [layout, selectedGrade, series]);

  const selectedNode = selectedId != null ? layout.nodesById.get(selectedId) : null;
  const innerMinWidth = GUTTER_W + layout.grid.width;

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setSelectedId(null);
          setFocusId(null);
        }
      }}
    >
      {/* Card header: series toggle + legend / hint */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-[#d4a574]/40 dark:border-[#8b6f47]/60 bg-gradient-to-r from-teal-50 to-[#fef9f3] dark:from-teal-900/20 dark:to-[#2d2618]">
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
            <span className="text-[10px] text-gray-400 hidden lg:inline">
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
      </div>

      <div
        className="overflow-auto"
        style={{ maxHeight: maxH ?? 544 }}
        ref={scrollRef}
        onClick={(e) => {
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
          <div className="relative" style={{ width: layout.grid.width }}>
            {layout.grid.columns.map((c, i) => (
              <span
                key={c.grade}
                className={cn(
                  "absolute top-0 h-full flex items-center justify-center text-[10px] font-bold uppercase tracking-widest",
                  c.grade === selectedGrade && overlayActive
                    ? "text-teal-600 dark:text-teal-400"
                    : "text-gray-400"
                )}
                style={{ left: c.x, width: c.width }}
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
                className="flex items-start justify-center pt-2"
                style={{
                  height: r.height + (i < layout.grid.rows.length - 1 ? 16 : 0),
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

          {/* Canvas — sized from the layout object only */}
          <div
            role="group"
            aria-label="Curriculum concept map"
            className="relative shrink-0"
            style={{ width: layout.grid.width, height: layout.grid.height }}
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
              highlightKey={`${activeId ?? ""}`}
              relatedEdges={related?.edges ?? null}
              hasActive={activeId != null}
              reduced={reduced}
            />

            {layout.nodes.map((n) => {
              // Selected grade gets the full tier set; earlier grades show
              // the cohort's own recorded coverage from previous years.
              const status =
                overlayActive && n.concept.grade === selectedGrade
                  ? statusMap.get(n.concept.id) ?? "no-data"
                  : overlayActive &&
                      n.col < selectedCol &&
                      cohortCovered.has(n.concept.id)
                    ? "covered"
                    : undefined;
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
}
