"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  GraduationCap,
  Phone,
  Quote,
  TrendingUp,
  CheckCircle2,
  XCircle,
  AlertCircle,
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

export function AssessmentKanban({ initial }: Props) {
  const [items, setItems] = useState(initial);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverLane, setHoverLane] = useState<AssessmentStage | null>(null);

  const grouped = useMemo(() => {
    const map: Record<AssessmentStage, Assessment[]> = {
      booked: [],
      attended: [],
      "follow-up": [],
      enrolled: [],
      lost: [],
    };
    for (const a of items) map[a.stage].push(a);
    // Sort each lane by date (booked: ascending, others: most recent first)
    map.booked.sort((a, b) => a.bookedFor.localeCompare(b.bookedFor));
    map.attended.sort((a, b) => b.bookedFor.localeCompare(a.bookedFor));
    map["follow-up"].sort((a, b) =>
      (a.followUpDue ?? "").localeCompare(b.followUpDue ?? "")
    );
    map.enrolled.sort((a, b) => b.bookedFor.localeCompare(a.bookedFor));
    map.lost.sort((a, b) => b.bookedFor.localeCompare(a.bookedFor));
    return map;
  }, [items]);

  const handleDrop = (laneId: AssessmentStage) => {
    if (!draggingId) return;
    setItems((prev) =>
      prev.map((a) => (a.id === draggingId ? { ...a, stage: laneId } : a))
    );
    setDraggingId(null);
    setHoverLane(null);
  };

  return (
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
              {cards.map((a) => (
                <Card
                  key={a.id}
                  a={a}
                  onDragStart={() => setDraggingId(a.id)}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setHoverLane(null);
                  }}
                  dragging={draggingId === a.id}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Card({
  a,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  a: Assessment;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const followUpFlag =
    a.stage === "follow-up" && a.followUpDue
      ? followUpUrgency(a.followUpDue)
      : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`bg-white rounded-md border border-ink-200 p-3 text-sm shadow-sm cursor-grab active:cursor-grabbing ${
        dragging ? "opacity-50" : ""
      }`}
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
  const now = new Date("2026-05-19T00:00:00+08:00").getTime(); // pinned demo date
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
