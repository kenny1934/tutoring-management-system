"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type Props = { initial: Assessment[] };

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
  attended: "bg-accent-50",
  "follow-up": "bg-amber-50",
  enrolled: "bg-emerald-50",
  lost: "bg-rose-50",
};

const NEXT_STAGE: Partial<Record<AssessmentStage, AssessmentStage>> = {
  booked: "attended",
  attended: "follow-up",
  "follow-up": "enrolled",
};

const SOURCES = ["Referral", "Walk-in", "Online"] as const;
const GRADES = ["P1", "P2", "P3", "P4", "P5", "P6"] as const;

export function AssessmentKanban({ initial }: Props) {
  const [items, setItems] = useState(initial);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverLane, setHoverLane] = useState<AssessmentStage | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const focusedRef = useRef<HTMLDivElement | null>(null);
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

  // Conversion rate: enrolled / (enrolled + lost)
  const stats = useMemo(() => {
    const enrolled = items.filter((a) => a.stage === "enrolled").length;
    const lost = items.filter((a) => a.stage === "lost").length;
    const settled = enrolled + lost;
    const conversion = settled > 0 ? Math.round((enrolled / settled) * 100) : null;
    return { enrolled, lost, conversion, total: items.length };
  }, [items]);

  const visible = useMemo(() => {
    return items.filter((a) => {
      if (sourceFilter && !a.source.includes(sourceFilter)) return false;
      if (gradeFilter && a.childGrade !== gradeFilter) return false;
      return true;
    });
  }, [items, sourceFilter, gradeFilter]);

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

  const handleDrop = (laneId: AssessmentStage) => {
    if (!draggingId) return;
    setItems((prev) =>
      prev.map((a) => (a.id === draggingId ? { ...a, stage: laneId } : a))
    );
    setDraggingId(null);
    setHoverLane(null);
  };

  const moveNext = (id: string) => {
    setItems((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const next = NEXT_STAGE[a.stage];
        return next ? { ...a, stage: next } : a;
      })
    );
  };

  const addBooking = () => {
    alert(
      "Demo only — would open a 'new booking' form (child name, grade, guardian contact, preferred slot)."
    );
  };

  return (
    <div className="space-y-3">
      <Toolbar
        stats={stats}
        sourceFilter={sourceFilter}
        gradeFilter={gradeFilter}
        onSource={setSourceFilter}
        onGrade={setGradeFilter}
        onAdd={addBooking}
      />

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        {LANES.map((lane) => {
          const cards = grouped[lane.id];
          const isHover = hoverLane === lane.id;
          return (
            <div
              key={lane.id}
              onDragOver={(e) => {
                e.preventDefault();
                setHoverLane(lane.id);
              }}
              onDragLeave={() => setHoverLane((v) => (v === lane.id ? null : v))}
              onDrop={() => handleDrop(lane.id)}
              className={`rounded-lg border ${
                isHover
                  ? "border-accent-500 ring-2 ring-accent-200"
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
              <div className="flex-1 p-2 space-y-2">
                {cards.length === 0 && (
                  <div className="text-xs text-ink-400 text-center py-6">
                    Empty
                  </div>
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
                      focused={isFocused}
                      pulsing={isFocused && pulsing}
                      cardRef={isFocused ? focusedRef : undefined}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Toolbar({
  stats,
  sourceFilter,
  gradeFilter,
  onSource,
  onGrade,
  onAdd,
}: {
  stats: { total: number; enrolled: number; lost: number; conversion: number | null };
  sourceFilter: string | null;
  gradeFilter: string | null;
  onSource: (v: string | null) => void;
  onGrade: (v: string | null) => void;
  onAdd: () => void;
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

      <button
        onClick={onAdd}
        className="rounded-md bg-accent-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-accent-700 flex items-center gap-1 whitespace-nowrap"
      >
        <Plus className="h-4 w-4" />
        New booking
      </button>
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
  focused,
  pulsing,
  cardRef,
}: {
  a: Assessment;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
  onMoveNext: () => void;
  focused: boolean;
  pulsing: boolean;
  cardRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const followUpFlag =
    a.stage === "follow-up" && a.followUpDue
      ? followUpUrgency(a.followUpDue)
      : null;

  const canMoveNext = a.stage in NEXT_STAGE;

  const focusClass = focused
    ? `ring-2 ring-mc-red-500 ring-offset-2 ${pulsing ? "animate-pulse" : ""}`
    : "";

  return (
    <div
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
          title={`Move to ${NEXT_STAGE[a.stage]}`}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-md border border-ink-300 bg-white hover:bg-ink-100 p-1"
        >
          <ArrowRight className="h-3.5 w-3.5 text-ink-600" />
        </button>
      )}
    </div>
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
