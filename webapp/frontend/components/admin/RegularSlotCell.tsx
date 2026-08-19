"use client";

import { memo, useState, useCallback, useEffect, useMemo } from "react";
import { Plus } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { splitGradeStream } from "@/lib/regular-utils";
import { getGradeColor } from "@/lib/constants";
import { EnteringGradeBadge } from "@/components/ui/grade-label";
import { RegularSlotCard, type RegularTutorOption } from "./RegularSlotCard";
import type { RegularDemandCell, RegularSlot, RegularSlotUpdate } from "@/types";

export interface RegularDemandBarFilter {
  day: string;
  timeSlot: string;
  grade: string;
  /** Effective stream (C/E) behind the clicked bar; null for a bare-grade bar. */
  langStream: string | null;
  tier: "first" | "second";
}

interface RegularSlotCellProps {
  day: string;
  timeSlot: string;
  /** This (day, time) is outside the branch's ladder. The cell refuses slot
   *  creation and, while empty, drops and taps; existing slots stay fully
   *  manageable so off-ladder data is never stranded. */
  closed?: boolean;
  demandCell?: RegularDemandCell;
  slots: RegularSlot[];
  grades: string[];
  /** Selectable slot streams (C/E), passed through to each slot card. */
  streams: string[];
  /** Active grade-stream keys (F1C, F1E, ...) with demand somewhere in the grid.
   *  Rendered as demand rows in every cell for cross-cell vertical alignment. */
  gradeStreams: string[];
  tutors: RegularTutorOption[];
  readOnly?: boolean;
  onCreateSlot: (day: string, timeSlot: string) => void;
  onUpdateSlot: (slotId: number, data: RegularSlotUpdate) => void;
  onDeleteSlot: (slotId: number) => void;
  onDropStudent: (applicationId: number, slotId: number) => void;
  onUnassign: (applicationId: number, studentName: string) => void;
  onClickStudent?: (applicationId: number) => void;
  onDropFailed?: (reason: string) => void;
  prefHighlight?: boolean;
  /** A slot filter is on and this cell holds no matching slot, so it recedes to
   * let the matching cells stand out. */
  dimmed?: boolean;
  /** Highest per-grade demand across the whole grid, so every cell's bars are
   * drawn on one comparable scale. */
  gradeMaxDemand?: number;
  onDemandBarClick?: (filter: RegularDemandBarFilter) => void;
  slotHighlightTarget?: {
    applicationId: number;
    scrollSlotId: number | null;
    seq: number;
  } | null;
  /** Mobile tap-to-place: when set, the cell + each inner slot card become
   * tap targets that fire onDropStudent with this appId. */
  pendingPlacementAppId?: number | null;
  /** Schoolmate highlight key, threaded to each slot card. */
  schoolHighlight?: string | null;
}

// Opacity the backup-choice half of a bar carries, so first and second choice
// read as two weights of one colour rather than two colours.
const BACKUP_BAR_OPACITY = 0.45;

// The chip in front of a demand bar, at both its weights. No vertical padding:
// the row is 7px and these have to stay inside it, or neighbouring rows overlap
// visibly now that the label carries a background.
const DEMAND_CHIP =
  "text-[8px] font-bold w-[24px] shrink-0 text-center leading-none rounded px-0.5";

function heatColor(count: number): string {
  if (count === 0) return "bg-white dark:bg-[#1a1a1a]";
  if (count <= 3) return "bg-orange-50/60 dark:bg-orange-950/20";
  if (count <= 6) return "bg-orange-100/60 dark:bg-orange-900/25";
  if (count <= 10) return "bg-orange-200/50 dark:bg-orange-800/25";
  return "bg-orange-300/40 dark:bg-orange-700/25";
}

function compareRegularSlots(a: RegularSlot, b: RegularSlot): number {
  const gradeCmp = (a.grade ?? "").localeCompare(b.grade ?? "");
  if (gradeCmp !== 0) return gradeCmp;
  const tutorCmp = (a.tutor_name ?? "").localeCompare(b.tutor_name ?? "");
  if (tutorCmp !== 0) return tutorCmp;
  return a.id - b.id;
}

export const RegularSlotCell = memo(function RegularSlotCell({
  day,
  timeSlot,
  closed = false,
  demandCell,
  slots,
  grades,
  streams,
  gradeStreams,
  tutors,
  readOnly = false,
  onCreateSlot,
  onUpdateSlot,
  onDeleteSlot,
  onDropStudent,
  onUnassign,
  onClickStudent,
  onDropFailed,
  prefHighlight,
  dimmed = false,
  gradeMaxDemand = 1,
  onDemandBarClick,
  slotHighlightTarget,
  pendingPlacementAppId,
  schoolHighlight,
}: RegularSlotCellProps) {
  const [dragOver, setDragOver] = useState(false);

  // Slots auto-sort by (grade, tutor, id). While the pointer is inside the
  // cell, order is frozen so cards don't shuffle under the admin's edits; on
  // mouse-leave the freeze releases and cards settle into sorted order, with
  // the last-edited card briefly ringing.
  const [frozenOrder, setFrozenOrder] = useState<number[] | null>(null);
  const [lastEditedId, setLastEditedId] = useState<number | null>(null);
  const [settlingId, setSettlingId] = useState<number | null>(null);

  const sortedSlots = useMemo(() => [...slots].sort(compareRegularSlots), [slots]);

  const displaySlots = useMemo(() => {
    if (!frozenOrder) return sortedSlots;
    const byId = new Map(slots.map((s) => [s.id, s] as const));
    const frozenSet = new Set(frozenOrder);
    const preserved = frozenOrder
      .map((id) => byId.get(id))
      .filter((s): s is RegularSlot => !!s);
    const newlyAdded = slots.filter((s) => !frozenSet.has(s.id));
    return [...preserved, ...newlyAdded];
  }, [slots, frozenOrder, sortedSlots]);

  const handleMouseEnter = useCallback(() => {
    if (frozenOrder !== null) return;
    setFrozenOrder(sortedSlots.map((s) => s.id));
    setLastEditedId(null);
  }, [frozenOrder, sortedSlots]);

  const handleMouseLeave = useCallback(() => {
    if (frozenOrder !== null && lastEditedId !== null) {
      const before = displaySlots.findIndex((s) => s.id === lastEditedId);
      const after = sortedSlots.findIndex((s) => s.id === lastEditedId);
      if (before !== -1 && after !== -1 && before !== after) {
        setSettlingId(lastEditedId);
      }
    }
    setFrozenOrder(null);
    setLastEditedId(null);
    setDragOver(false);
  }, [frozenOrder, lastEditedId, displaySlots, sortedSlots]);

  useEffect(() => {
    if (settlingId === null) return;
    const t = setTimeout(() => setSettlingId(null), 700);
    return () => clearTimeout(t);
  }, [settlingId]);

  const first = demandCell?.total_first_pref ?? 0;
  const second = demandCell?.total_second_pref ?? 0;
  const totalAssigned = slots.reduce((sum, s) => sum + s.assigned_count, 0);
  const remainingDemand = Math.max(0, first + second - totalAssigned);

  // A closed cell only blocks placement while it holds no slot: an off-ladder
  // slot that exists was made deliberately and stays a working drop target.
  const closedEmpty = closed && slots.length === 0;

  // Drop target for the whole cell (assigns to first non-full slot). Not
  // calling preventDefault on a closed empty cell means the drop event never
  // fires and the browser shows the not-allowed cursor.
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (readOnly || closedEmpty) return;
    e.preventDefault();
    setDragOver(true);
  }, [readOnly, closedEmpty]);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const placeInFirstOpenSlot = useCallback((appId: number) => {
    const target = sortedSlots.find((s) => s.assigned_count < s.max_students);
    if (target) {
      onDropStudent(appId, target.id);
    } else if (sortedSlots.length > 0) {
      onDropFailed?.("All slots in this cell are full");
    } else {
      onDropFailed?.("Create a slot first");
    }
  }, [sortedSlots, onDropStudent, onDropFailed]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (readOnly) return;
      e.preventDefault();
      setDragOver(false);
      const appId = parseInt(e.dataTransfer.getData("application-id"));
      if (isNaN(appId)) return;
      placeInFirstOpenSlot(appId);
    },
    [readOnly, placeInFirstOpenSlot]
  );

  // Cell-level tap mirrors the cell-level drop fallback (first non-full slot).
  const tapPlaceActive = pendingPlacementAppId != null && !readOnly;
  const handleTapPlace = useCallback(
    (e: React.MouseEvent) => {
      if (!tapPlaceActive) return;
      const target = e.target as HTMLElement;
      // Slot cards and the Add-slot button stop or own this tap themselves.
      if (target.closest("button")) return;
      if (closedEmpty) {
        onDropFailed?.(`This branch has no classes on ${day} at ${timeSlot}.`);
        return;
      }
      placeInFirstOpenSlot(pendingPlacementAppId!);
    },
    [tapPlaceActive, pendingPlacementAppId, placeInFirstOpenSlot, closedEmpty, onDropFailed, day, timeSlot]
  );

  return (
    <div
      className={cn(
        "min-h-[80px] p-1.5 transition relative",
        // Hatching marks the cell as outside the branch's ladder; it replaces
        // the demand heat tint, which has nothing real to show there.
        closed
          ? "bg-[#f6f1e9] dark:bg-[#211e19] bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(0,0,0,0.05)_6px,rgba(0,0,0,0.05)_12px)] dark:bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(255,255,255,0.04)_6px,rgba(255,255,255,0.04)_12px)]"
          : heatColor(remainingDemand),
        dimmed && "opacity-40 hover:opacity-100",
        dragOver && "ring-2 ring-inset ring-primary",
        prefHighlight && !dragOver && "ring-2 ring-inset ring-primary/40 bg-primary/5"
      )}
      title={closed ? `No classes on ${day} at ${timeSlot}` : undefined}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={tapPlaceActive ? handleTapPlace : undefined}
    >
      {/* Demand sparklines: always rendered to keep vertical alignment across cells */}
      <div className="mb-1 space-y-px">
        {gradeStreams.map((gs) => {
          const gFirst = demandCell?.by_grade_stream_first[gs] ?? 0;
          const gSecond = demandCell?.by_grade_stream_second[gs] ?? 0;
          const total = gFirst + gSecond;
          const { grade, stream } = splitGradeStream(gs);
          // One colour per grade-stream, straight from the app-wide grade badge
          // palette, driving both the label chip and its bars. Keeping them on
          // the same source is the point: a label tinted from a second palette
          // read as a different stream than the bar beside it.
          const gradeColor = getGradeColor(grade, stream ?? undefined);
          const barPct = gradeMaxDemand > 0 && total > 0 ? (total / gradeMaxDemand) * 100 : 0;
          const firstPct = total > 0 ? (gFirst / total) * 100 : 0;
          return (
            <div
              key={gs}
              className="flex items-center gap-0.5 h-[7px]"
              title={total > 0 ? `${gs}: ${gFirst} first choice, ${gSecond} backup` : `${gs}: no demand`}
            >
              {/* The compact grade badge, the shared one, since a demand key
                  is a class this intake will run and its grade is therefore
                  already the grade being entered. With no demand behind it the
                  chip is not a badge at all but a dimmed label, which is why
                  the two states are written out rather than folded into one
                  conditional background. */}
              {total > 0 ? (
                <EnteringGradeBadge
                  className={cn(DEMAND_CHIP, "text-gray-800")}
                  grade={grade}
                  langStream={stream}
                />
              ) : (
                <span className={cn(DEMAND_CHIP, "text-muted-foreground/30")}>{gs}</span>
              )}
              <div className="flex-1 h-1.5 flex">
                {barPct > 0 && (
                  <>
                    {gFirst > 0 && (
                      <div
                        className={cn(
                          "h-full rounded-l-sm", gSecond === 0 && "rounded-r-sm",
                          onDemandBarClick && "cursor-pointer hover:opacity-80"
                        )}
                        style={{ width: `${firstPct * barPct / 100}%`, backgroundColor: gradeColor }}
                        onClick={onDemandBarClick ? (e) => { e.stopPropagation(); onDemandBarClick({ day, timeSlot, grade, langStream: stream, tier: "first" }); } : undefined}
                      />
                    )}
                    {gSecond > 0 && (
                      <div
                        className={cn(
                          "h-full rounded-r-sm", gFirst === 0 && "rounded-l-sm",
                          onDemandBarClick && "cursor-pointer hover:opacity-80"
                        )}
                        style={{
                          width: `${(100 - firstPct) * barPct / 100}%`,
                          backgroundColor: gradeColor,
                          opacity: BACKUP_BAR_OPACITY,
                        }}
                        onClick={onDemandBarClick ? (e) => { e.stopPropagation(); onDemandBarClick({ day, timeSlot, grade, langStream: stream, tier: "second" }); } : undefined}
                      />
                    )}
                  </>
                )}
              </div>
              <span className={cn("text-[8px] tabular-nums w-3 shrink-0 text-right leading-none", total > 0 ? "text-muted-foreground" : "text-muted-foreground/30")}>
                {total || ""}
              </span>
            </div>
          );
        })}
      </div>

      {/* Slot cards */}
      <div className="space-y-1">
        {displaySlots.map((slot) => (
          <motion.div
            key={slot.id}
            layout
            transition={{ type: "spring", stiffness: 400, damping: 34, mass: 0.7 }}
            className={cn(
              "rounded-[5px] transition-shadow duration-500 ease-out",
              settlingId === slot.id &&
                "ring-2 ring-primary/70 ring-offset-1 ring-offset-transparent shadow-sm"
            )}
          >
            <RegularSlotCard
              slot={slot}
              grades={grades}
              streams={streams}
              tutors={tutors}
              readOnly={readOnly}
              onUpdate={(data) => {
                setLastEditedId(slot.id);
                onUpdateSlot(slot.id, data);
              }}
              onDelete={() => onDeleteSlot(slot.id)}
              onDropStudent={(appId) => onDropStudent(appId, slot.id)}
              onUnassign={onUnassign}
              onClickStudent={onClickStudent}
              highlightTarget={slotHighlightTarget}
              pendingPlacementAppId={pendingPlacementAppId}
              onTapPlaceFailed={onDropFailed}
              schoolHighlight={schoolHighlight}
            />
          </motion.div>
        ))}
      </div>

      {/* Add slot button — more prominent when no slots yet. Closed cells
          never offer it: creating an off-ladder slot is the accident this
          guard exists to prevent. */}
      {!readOnly && !closed && (
        <button
          onClick={() => onCreateSlot(day, timeSlot)}
          className={cn(
            "mt-1 w-full flex items-center justify-center gap-1 rounded transition-colors",
            slots.length === 0
              ? "py-2 text-xs border border-dashed border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/10"
              : "py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-primary/10"
          )}
        >
          <Plus className={slots.length === 0 ? "h-3.5 w-3.5" : "h-3 w-3"} />
          {slots.length === 0 ? "Add slot" : "slot"}
        </button>
      )}
    </div>
  );
});
