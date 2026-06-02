"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  GraduationCap,
  Phone,
  Quote,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Plus,
  X,
} from "lucide-react";
import type { Assessment, AssessmentStage } from "@/lib/types";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";

const LANES: { id: AssessmentStage; label: string; hint: string }[] = [
  {
    id: "booked",
    label: "Booked",
    hint: "Scheduled but not yet attended",
  },
  {
    id: "attended",
    label: "Attended",
    hint: "Assessed; awaiting follow-up touchpoint",
  },
  {
    id: "follow-up",
    label: "Follow-up",
    hint: "In active conversation with parent",
  },
  {
    id: "enrolled",
    label: "Enrolled",
    hint: "Converted to active student",
  },
  {
    id: "lost",
    label: "Lost",
    hint: "Decided not to join",
  },
];

const LANE_TINT: Record<AssessmentStage, string> = {
  booked: "bg-ink-100",
  attended: "bg-mc-peach-50",
  "follow-up": "bg-amber-50",
  enrolled: "bg-emerald-50",
  lost: "bg-rose-50",
};

const NEXT_STAGE: Partial<Record<AssessmentStage, AssessmentStage>> = {
  booked: "attended",
  attended: "follow-up",
  "follow-up": "enrolled",
};

const STAGE_LABEL: Record<AssessmentStage, string> = {
  booked: "Booked",
  attended: "Attended",
  "follow-up": "Follow-up",
  enrolled: "Enrolled",
  lost: "Lost",
};

const SOURCES = ["Referral", "Walk-in", "Online"] as const;
const GRADES = ["P1", "P2", "P3", "P4", "P5", "P6"] as const;

export function AssessmentKanban() {
  const { assessments: items, setAssessmentStage } = usePrimaryStore();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverLane, setHoverLane] = useState<AssessmentStage | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
  // Screen-reader announcement for stage changes (drag, arrow, or select).
  const [announce, setAnnounce] = useState("");

  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const focusedRef = useRef<HTMLLIElement | null>(null);
  // Pulse drops off after a couple seconds; the steady ring stays until
  // the user navigates away or removes the focus query.
  const [pulsing, setPulsing] = useState(false);

  // Clear filters when arriving with a focus id so the target card is
  // guaranteed visible, regardless of what was filtered before.
  useEffect(() => {
    if (!focusId) return;
    setSourceFilter(null);
    setGradeFilter(null);
  }, [focusId]);

  useEffect(() => {
    if (!focusId) return;
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), 2000);
    return () => clearTimeout(t);
  }, [focusId]);

  useEffect(() => {
    if (!focusId) return;
    if (focusedRef.current) {
      focusedRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [focusId]);

  const visible = useMemo(() => {
    return items.filter((a) => {
      // Source pill matches by category prefix — seed sources like
      // "Referral · existing P5 family" should match the "Referral" pill.
      if (sourceFilter && !a.source.startsWith(sourceFilter)) return false;
      if (gradeFilter && a.childGrade !== gradeFilter) return false;
      return true;
    });
  }, [items, sourceFilter, gradeFilter]);

  const filterActive = sourceFilter !== null || gradeFilter !== null;

  // Conversion rate: enrolled / (enrolled + lost). Computed from the visible
  // (filtered) set so the headline numbers always match the cards on screen.
  const stats = useMemo(() => {
    const enrolled = visible.filter((a) => a.stage === "enrolled").length;
    const lost = visible.filter((a) => a.stage === "lost").length;
    const settled = enrolled + lost;
    const conversion = settled > 0 ? Math.round((enrolled / settled) * 100) : null;
    return { enrolled, lost, conversion, total: visible.length };
  }, [visible]);

  const grouped = useMemo(() => {
    const map: Record<AssessmentStage, Assessment[]> = {
      booked: [],
      attended: [],
      "follow-up": [],
      enrolled: [],
      lost: [],
    };
    for (const a of visible) map[a.stage].push(a);
    map.booked.sort((a, b) => a.bookedFor.localeCompare(b.bookedFor));
    map.attended.sort((a, b) => b.bookedFor.localeCompare(a.bookedFor));
    map["follow-up"].sort((a, b) =>
      (a.followUpDue ?? "").localeCompare(b.followUpDue ?? "")
    );
    map.enrolled.sort((a, b) => b.bookedFor.localeCompare(a.bookedFor));
    map.lost.sort((a, b) => b.bookedFor.localeCompare(a.bookedFor));
    return map;
  }, [visible]);

  // Single stage-change path shared by drag-drop, the per-card stage select,
  // and the "move next" arrow. Wraps the store action and announces the move.
  const changeStage = (id: string, stage: AssessmentStage) => {
    const a = items.find((x) => x.id === id);
    if (!a || a.stage === stage) return;
    setAssessmentStage(id, stage);
    setAnnounce(`Moved ${a.childName} to ${STAGE_LABEL[stage]}`);
  };

  const handleDrop = (laneId: AssessmentStage) => {
    if (!draggingId) return;
    changeStage(draggingId, laneId);
    setDraggingId(null);
    setHoverLane(null);
  };

  const moveNext = (id: string) => {
    const a = items.find((x) => x.id === id);
    if (!a) return;
    const next = NEXT_STAGE[a.stage];
    if (next) changeStage(id, next);
  };

  return (
    <div className="space-y-3">
      <Toolbar
        stats={stats}
        totalAll={items.length}
        filterActive={filterActive}
        sourceFilter={sourceFilter}
        gradeFilter={gradeFilter}
        onSource={setSourceFilter}
        onGrade={setGradeFilter}
      />

      {/* Announces stage changes (drag, arrow, or stage select) to AT. */}
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        {LANES.map((lane) => {
          const cards = grouped[lane.id];
          const isHover = hoverLane === lane.id;
          return (
            <section
              key={lane.id}
              aria-label={`${lane.label} — ${cards.length} ${
                cards.length === 1 ? "assessment" : "assessments"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setHoverLane(lane.id);
              }}
              onDragLeave={() => setHoverLane((v) => (v === lane.id ? null : v))}
              onDrop={() => handleDrop(lane.id)}
              className={`rounded-lg border ${
                isHover
                  ? "border-mc-red-500 ring-2 ring-mc-red-200"
                  : "border-ink-200"
              } ${LANE_TINT[lane.id]} flex flex-col min-h-[200px]`}
            >
              <div className="px-3 py-2 border-b border-ink-200/70 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-ink-800">
                    {lane.label}
                  </div>
                  <div className="text-xs text-ink-500">{lane.hint}</div>
                </div>
                <span className="text-xs rounded-full bg-white border border-ink-200 px-2 py-0.5 text-ink-700">
                  {cards.length}
                </span>
              </div>
              <ul className="flex-1 p-2 space-y-2 list-none">
                {cards.length === 0 && (
                  <li className="text-xs text-ink-400 text-center py-6">
                    Empty
                  </li>
                )}
                {cards.map((a) => {
                  const isFocused = a.id === focusId;
                  return (
                    <Card
                      key={a.id}
                      a={a}
                      onDragStart={() => setDraggingId(a.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setHoverLane(null);
                      }}
                      dragging={draggingId === a.id}
                      onMoveNext={() => moveNext(a.id)}
                      onChangeStage={(stage) => changeStage(a.id, stage)}
                      focused={isFocused}
                      pulsing={isFocused && pulsing}
                      cardRef={isFocused ? focusedRef : undefined}
                    />
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Toolbar({
  stats,
  totalAll,
  filterActive,
  sourceFilter,
  gradeFilter,
  onSource,
  onGrade,
}: {
  stats: { total: number; enrolled: number; lost: number; conversion: number | null };
  totalAll: number;
  filterActive: boolean;
  sourceFilter: string | null;
  gradeFilter: string | null;
  onSource: (v: string | null) => void;
  onGrade: (v: string | null) => void;
}) {
  return (
    <div className="surface p-3 flex flex-wrap items-center gap-3 text-sm">
      <div className="flex items-center gap-4 flex-1 min-w-[200px]">
        <Stat label="Total" value={stats.total} />
        <Stat label="Enrolled" value={stats.enrolled} tone="good" />
        <Stat label="Lost" value={stats.lost} tone="bad" />
        <Stat
          label="Conversion"
          value={stats.conversion === null ? "—" : `${stats.conversion}%`}
          tone={
            stats.conversion === null
              ? undefined
              : stats.conversion >= 70
                ? "good"
                : stats.conversion >= 50
                  ? "warn"
                  : "bad"
          }
        />
        {filterActive && (
          <span className="text-xs text-ink-500 rounded-md bg-ink-100 px-2 py-1">
            Showing {stats.total} of {totalAll}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <FilterPill
          label="Source"
          value={sourceFilter}
          options={SOURCES as readonly string[]}
          onChange={onSource}
        />
        <FilterPill
          label="Grade"
          value={gradeFilter}
          options={GRADES as readonly string[]}
          onChange={onGrade}
        />
      </div>

      <div className="relative inline-flex items-center">
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Demo only. Would open a new booking form (child name, grade, guardian contact, preferred slot)."
          className="rounded-md bg-mc-red-600/60 text-white px-3 py-1.5 text-sm font-medium flex items-center gap-1 whitespace-nowrap cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
          New booking
        </button>
        <span className="ml-1.5 rounded-full bg-mc-yellow-100 text-mc-yellow-600 border border-mc-yellow-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
          Demo
        </span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "good" | "warn" | "bad";
}) {
  const cls =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "bad"
          ? "text-rose-700"
          : "text-ink-900";
  return (
    <div>
      <div className={`text-lg font-semibold leading-none ${cls}`}>{value}</div>
      <div className="text-xs text-ink-500 mt-0.5">{label}</div>
    </div>
  );
}

function FilterPill({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: readonly string[];
  onChange: (v: string | null) => void;
}) {
  if (value) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-ink-300 bg-white pl-2 pr-1 py-1 text-xs">
        <span className="text-ink-500">{label}:</span>
        <span className="font-medium text-ink-800">{value}</span>
        <button
          onClick={() => onChange(null)}
          className="text-ink-400 hover:text-ink-800 p-0.5"
          aria-label="Clear filter"
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    );
  }
  return (
    <select
      value=""
      onChange={(e) => onChange(e.target.value || null)}
      className="text-xs rounded-md border border-ink-300 bg-white px-2 py-1"
    >
      <option value="">{label}: any</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Card({
  a,
  onDragStart,
  onDragEnd,
  dragging,
  onMoveNext,
  onChangeStage,
  focused,
  pulsing,
  cardRef,
}: {
  a: Assessment;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
  onMoveNext: () => void;
  onChangeStage: (stage: AssessmentStage) => void;
  focused: boolean;
  pulsing: boolean;
  cardRef?: React.RefObject<HTMLLIElement | null>;
}) {
  const stageSelectId = useId();
  const followUpFlag =
    a.stage === "follow-up" && a.followUpDue
      ? followUpUrgency(a.followUpDue)
      : null;

  const canMoveNext = a.stage in NEXT_STAGE;

  const focusClass = focused
    ? `ring-2 ring-mc-red-500 ring-offset-2 ${pulsing ? "animate-pulse" : ""}`
    : "";

  return (
    <li
      ref={cardRef}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`bg-white rounded-md border border-ink-200 p-3 text-sm shadow-sm cursor-grab active:cursor-grabbing relative group ${
        dragging ? "opacity-50" : ""
      } ${focusClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-ink-900 truncate">{a.childName}</div>
          <div className="text-xs text-ink-500 flex items-center gap-1 mt-0.5">
            <GraduationCap className="h-3 w-3" />
            {a.childGrade}
          </div>
        </div>
        {typeof a.scorePct === "number" && (
          <div
            className={`text-xs rounded-md px-1.5 py-0.5 font-medium ${
              a.scorePct >= 80
                ? "bg-emerald-100 text-emerald-700"
                : a.scorePct >= 65
                  ? "bg-amber-100 text-amber-700"
                  : "bg-rose-100 text-rose-700"
            }`}
          >
            {a.scorePct}%
          </div>
        )}
      </div>

      <div className="mt-2 space-y-1 text-xs text-ink-600">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-3 w-3 text-ink-400" />
          {formatDateTime(a.bookedFor)}
        </div>
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3 text-ink-400" />
          {a.guardianName} · {a.guardianContact}
        </div>
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3 w-3 text-ink-400" />
          {a.source}
        </div>
      </div>

      {followUpFlag && (
        <div
          className={`mt-2 flex items-center gap-1.5 text-xs rounded-md px-2 py-1 ${followUpFlag.tone}`}
        >
          {followUpFlag.icon}
          {followUpFlag.text}
        </div>
      )}

      {a.notes && (
        <div className="mt-2 text-xs text-ink-600 bg-ink-50 rounded-md px-2 py-1.5 flex items-start gap-1.5">
          <Quote className="h-3 w-3 text-ink-400 mt-0.5 shrink-0" />
          {a.notes}
        </div>
      )}

      {canMoveNext && (
        <button
          onClick={onMoveNext}
          title={`Move to ${STAGE_LABEL[NEXT_STAGE[a.stage]!]}`}
          aria-label={`Move ${a.childName} to ${STAGE_LABEL[NEXT_STAGE[a.stage]!]}`}
          className="absolute top-2 right-2 opacity-60 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity rounded-md border border-ink-300 bg-white hover:bg-ink-100 p-1"
        >
          <ArrowRight className="h-3.5 w-3.5 text-ink-600" />
        </button>
      )}

      {/* Per-card stage control: keyboard- and touch-friendly, works in any
          direction (including correcting a mis-drop out of lost/enrolled). */}
      <div className="mt-2.5 flex items-center gap-1.5">
        <label htmlFor={stageSelectId} className="text-[11px] text-ink-500">
          Stage
        </label>
        <select
          id={stageSelectId}
          value={a.stage}
          onChange={(e) => onChangeStage(e.target.value as AssessmentStage)}
          className="flex-1 text-xs rounded-md border border-ink-300 bg-white px-2 py-1"
          aria-label={`Stage for ${a.childName}`}
        >
          {LANES.map((lane) => (
            <option key={lane.id} value={lane.id}>
              {lane.label}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-HK", {
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function followUpUrgency(dueIso: string) {
  const due = new Date(dueIso).getTime();
  const now = new Date("2026-05-19T00:00:00+08:00").getTime();
  const days = Math.floor((due - now) / 86400000);
  if (days < 0) {
    return {
      tone: "bg-rose-100 text-rose-700",
      icon: <AlertCircle className="h-3 w-3" />,
      text: `Overdue ${Math.abs(days)}d`,
    };
  }
  if (days <= 2) {
    return {
      tone: "bg-amber-100 text-amber-700",
      icon: <AlertCircle className="h-3 w-3" />,
      text: `Follow-up in ${days}d`,
    };
  }
  return {
    tone: "bg-emerald-50 text-emerald-700",
    icon: <CheckCircle2 className="h-3 w-3" />,
    text: `Follow-up ${dueIso}`,
  };
}
