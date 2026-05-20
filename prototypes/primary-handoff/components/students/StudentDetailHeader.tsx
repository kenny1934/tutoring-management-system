"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ChecktableAssignment, Session, Student } from "@/lib/types";
import {
  daysAgoLabel,
  daysUntilLabel,
  getInitials,
  getLastSession,
  getNextSession,
  getPendingCount,
} from "./student-utils";

type Props = {
  student: Student;
  sessions: Session[];
  assignments: ChecktableAssignment[];
  todayIso: string;
};

export function StudentDetailHeader({
  student,
  sessions,
  assignments,
  todayIso,
}: Props) {
  const pending = getPendingCount(student.id, assignments);
  const next = getNextSession(student.id, sessions, todayIso);
  const last = getLastSession(student.id, sessions, todayIso);

  return (
    <div className="space-y-3">
      <Link
        href="/students"
        className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="h-3 w-3" />
        Students
      </Link>

      <div className="flex items-start gap-4">
        <div className="h-14 w-14 rounded-full bg-ink-100 text-ink-700 grid place-items-center text-sm font-semibold shrink-0">
          {getInitials(student.name)}
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-xs text-ink-500 tabular-nums">
              {student.code}
            </span>
            <span className="text-xl font-semibold text-ink-900 truncate">
              {student.name}
            </span>
          </div>
          <div className="text-sm text-ink-600 mt-0.5">
            {student.grade} · {student.school} · {student.hwLoad} HW
          </div>
          {next && (
            <div className="text-sm text-ink-600 mt-0.5">
              {formatNextHeader(next)} · {next.tutor_name}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-600">
        <StatusDot
          label={
            pending > 0
              ? `${pending} pending HW`
              : "No pending HW"
          }
          tone={pending > 0 ? "amber" : "muted"}
        />
        {next && (
          <StatusDot
            label={`Next session ${daysUntilLabel(next.session_date, todayIso)}`}
            tone="muted"
          />
        )}
        {last && (
          <StatusDot
            label={`Last worked ${daysAgoLabel(last.session_date, todayIso)}`}
            tone="muted"
          />
        )}
      </div>
    </div>
  );
}

function StatusDot({
  label,
  tone,
}: {
  label: string;
  tone: "amber" | "muted";
}) {
  const dotCls = tone === "amber" ? "bg-amber-500" : "bg-ink-300";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} aria-hidden />
      {label}
    </span>
  );
}

function formatNextHeader(s: Session): string {
  const d = new Date(`${s.session_date}T${s.start_time}:00+08:00`);
  const weekday = d.toLocaleDateString("en-HK", { weekday: "short" });
  const date = d.toLocaleDateString("en-HK", {
    month: "short",
    day: "numeric",
  });
  const time = d
    .toLocaleTimeString("en-HK", { hour: "numeric", minute: "2-digit" })
    .toLowerCase();
  return `${weekday} ${date} · ${time}`;
}
