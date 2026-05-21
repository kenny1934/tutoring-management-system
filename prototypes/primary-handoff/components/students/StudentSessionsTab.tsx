"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarClock, ArrowRight, Star, CalendarPlus } from "lucide-react";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { DEMO_DAY } from "@/lib/mock-data/sessions";
import { getSessionStatusConfig } from "@/lib/session-status-config";
import type { Session } from "@/lib/types";
import { CreateEnrollmentModal } from "./CreateEnrollmentModal";

export function StudentSessionsTab() {
  const { id } = useParams<{ id: string }>();
  const { sessions, students } = usePrimaryStore();
  const student = students.find((s) => s.id === id);
  const [enrollOpen, setEnrollOpen] = useState(false);

  const studentSessions = useMemo(
    () => sessions.filter((s) => s.student_id === id),
    [sessions, id]
  );

  const upcoming = useMemo(
    () =>
      studentSessions
        .filter((s) => s.session_date >= DEMO_DAY)
        .sort((a, b) => {
          if (a.session_date !== b.session_date)
            return a.session_date.localeCompare(b.session_date);
          return a.start_time.localeCompare(b.start_time);
        }),
    [studentSessions]
  );

  const past = useMemo(
    () =>
      studentSessions
        .filter((s) => s.session_date < DEMO_DAY)
        .sort((a, b) => {
          if (a.session_date !== b.session_date)
            return b.session_date.localeCompare(a.session_date);
          return b.start_time.localeCompare(a.start_time);
        }),
    [studentSessions]
  );

  if (!student) return null;

  const header = (
    <div className="flex items-center justify-end">
      <button
        onClick={() => setEnrollOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-ink-800 text-white px-3 py-1.5 text-sm font-medium hover:bg-ink-900"
      >
        <CalendarPlus className="h-4 w-4" />
        New enrollment
      </button>
    </div>
  );

  if (studentSessions.length === 0) {
    return (
      <div className="space-y-3 max-w-3xl">
        {header}
        <div className="surface p-10 text-center text-sm text-ink-500">
          No sessions scheduled for this student yet.
        </div>
        {enrollOpen && (
          <CreateEnrollmentModal
            student={student}
            onClose={() => setEnrollOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {header}
      {enrollOpen && (
        <CreateEnrollmentModal
          student={student}
          onClose={() => setEnrollOpen(false)}
        />
      )}
      {upcoming.length > 0 && (
        <Section title="Upcoming" count={upcoming.length}>
          {upcoming.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </Section>
      )}
      {past.length > 0 && (
        <Section title="Past" count={past.length}>
          {past.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        <span className="text-xs text-ink-400">({count})</span>
      </div>
      <div className="surface divide-y divide-ink-100 overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function SessionRow({ session }: { session: Session }) {
  const cfg = getSessionStatusConfig(session.session_status);
  const StatusIcon = cfg.Icon;
  const d = new Date(`${session.session_date}T${session.start_time}:00+08:00`);
  const datePart = d.toLocaleDateString("en-HK", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timePart = d
    .toLocaleTimeString("en-HK", { hour: "numeric", minute: "2-digit" })
    .toLowerCase();

  return (
    <Link
      href={`/sessions?session=${session.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-ink-50 transition-colors"
    >
      <CalendarClock className="h-4 w-4 text-ink-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-ink-900 tabular-nums">
            {datePart}
          </span>
          <span className="text-sm text-ink-700 tabular-nums">{timePart}</span>
          <span className="text-xs text-ink-500">· {session.tutor_name}</span>
        </div>
        <div className="text-xs text-ink-500 mt-0.5 flex items-center gap-2">
          {session.room && <span>{session.room}</span>}
          {session.performance_rating && (
            <span className="inline-flex items-center gap-0.5 text-mc-yellow-600">
              <Star className="h-3 w-3 fill-current" />
              {session.performance_rating}
            </span>
          )}
        </div>
      </div>
      <div className={`flex items-center gap-1 text-xs ${cfg.textClass}`}>
        <StatusIcon className="h-3.5 w-3.5" />
        {session.session_status}
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-ink-300 shrink-0" />
    </Link>
  );
}
