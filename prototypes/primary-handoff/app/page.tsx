"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Calendar,
  Bell,
  Users,
  ClipboardCheck,
  MessageSquare,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  CalendarPlus,
} from "lucide-react";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { DEMO_DAY } from "@/lib/mock-data/sessions";
import { DEMO_NOW } from "@/lib/mock-data/parent-contacts";
import { SessionStatus } from "@/lib/types";
import type { SessionStatusValue } from "@/lib/types";
import { getSessionStatusConfig } from "@/lib/session-status-config";

const PENDING_MAKEUP_STATUSES: SessionStatusValue[] = [
  SessionStatus.SICK_LEAVE_PENDING,
  SessionStatus.WEATHER_PENDING,
  SessionStatus.RESCHEDULED_PENDING,
];

export default function DashboardPage() {
  const { sessions, contacts, students, enrollments } = usePrimaryStore();

  const todaySessions = useMemo(
    () =>
      sessions
        .filter((s) => s.session_date === DEMO_DAY)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [sessions]
  );

  const todayAttended = todaySessions.filter(
    (s) =>
      s.session_status === SessionStatus.ATTENDED ||
      s.session_status === SessionStatus.ATTENDED_MAKEUP
  ).length;
  const todayPending = todaySessions.length - todayAttended;

  const pendingMakeups = useMemo(
    () =>
      sessions.filter((s) =>
        PENDING_MAKEUP_STATUSES.includes(s.session_status)
      ),
    [sessions]
  );

  const followUpsDue = useMemo(() => {
    const todayDate = DEMO_NOW.slice(0, 10);
    return contacts.filter(
      (c) =>
        c.followUpNeeded &&
        !c.followUpDone &&
        c.followUpDate &&
        c.followUpDate <= todayDate
    );
  }, [contacts]);

  const upcomingFollowUps = useMemo(() => {
    const todayDate = DEMO_NOW.slice(0, 10);
    return contacts.filter(
      (c) =>
        c.followUpNeeded &&
        !c.followUpDone &&
        c.followUpDate &&
        c.followUpDate > todayDate
    );
  }, [contacts]);

  const studentById = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students]
  );

  const greeting = useMemo(() => {
    const hour = Number(DEMO_NOW.slice(11, 13));
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const todayLabel = new Date(`${DEMO_DAY}T00:00:00+08:00`).toLocaleDateString(
    "en-HK",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" }
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Greeting strip */}
      <header className="surface-mc px-5 py-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">
            {greeting}, Wendy
          </h1>
          <p className="text-sm text-ink-500 mt-0.5">
            {todayLabel} · Causeway Bay
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/sessions"
            className="text-sm inline-flex items-center gap-1.5 rounded-md bg-mc-red-600 text-white px-3 py-1.5 hover:bg-mc-red-700 font-medium"
          >
            <Calendar className="h-4 w-4" />
            Today's sessions
          </Link>
        </div>
      </header>

      {/* Stat tiles */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          Icon={Calendar}
          label="Today's sessions"
          value={String(todaySessions.length)}
          sub={`${todayAttended} attended · ${todayPending} pending`}
          tone="red"
          href="/sessions"
        />
        <StatTile
          Icon={CalendarPlus}
          label="Pending make-ups"
          value={String(pendingMakeups.length)}
          sub={
            pendingMakeups.length === 0
              ? "Nothing to schedule"
              : pendingMakeups.length === 1
                ? "Needs scheduling"
                : "Need scheduling"
          }
          tone="yellow"
          href="/sessions?filter=pending-makeups"
        />
        <StatTile
          Icon={Bell}
          label="Follow-ups due"
          value={String(followUpsDue.length)}
          sub={
            upcomingFollowUps.length > 0
              ? `+${upcomingFollowUps.length} upcoming`
              : "No upcoming"
          }
          tone={followUpsDue.length > 0 ? "red" : "neutral"}
          href="/comms"
        />
        <StatTile
          Icon={Users}
          label="Active students"
          value={String(students.length)}
          sub={`${enrollments.length} enrollments`}
          tone="neutral"
          href="/students"
        />
      </section>

      {/* Two-up: today's sessions + follow-ups */}
      <section className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <PanelHeader
            title="Today's sessions"
            count={todaySessions.length}
            href="/sessions"
          />
          <div className="surface-mc divide-y divide-mc-line">
            {todaySessions.length === 0 && (
              <EmptyState
                Icon={Calendar}
                title="Nothing on today"
                hint="Use the Sessions page to plan or look back at recent meetings."
              />
            )}
            {todaySessions.map((s) => {
              const student = studentById.get(s.student_id);
              if (!student) return null;
              const cfg = getSessionStatusConfig(s.session_status);
              const Icon = cfg.Icon;
              return (
                <Link
                  key={s.id}
                  href={`/sessions?session=${s.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-ink-50 transition-colors"
                >
                  <div
                    className={`h-8 w-8 rounded-md grid place-items-center shrink-0 ${cfg.stripeClass}`}
                  >
                    <Icon className={`h-4 w-4 ${cfg.iconClass ?? "text-white"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-ink-700 tabular-nums">
                        {s.start_time}
                      </span>
                      <span className="font-semibold text-ink-900 truncate">
                        {student.name}
                      </span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                        {student.grade}
                      </span>
                    </div>
                    <div className="text-xs text-ink-500 truncate">
                      {s.tutor_name}
                      {s.lesson_number > 0 && ` · Lesson ${s.lesson_number}`}
                    </div>
                  </div>
                  <div className={`text-xs font-medium ${cfg.textClass} shrink-0`}>
                    {s.session_status}
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-300 shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <PanelHeader
            title="Follow-ups due"
            count={followUpsDue.length}
            href="/comms"
            tone={followUpsDue.length > 0 ? "warn" : "neutral"}
          />
          <div className="surface-mc divide-y divide-mc-line">
            {followUpsDue.length === 0 && (
              <EmptyState
                Icon={CheckCircle2}
                title="All caught up"
                hint="No parent follow-ups owed today."
              />
            )}
            {followUpsDue.map((c) => {
              const student = studentById.get(c.studentId);
              if (!student) return null;
              const overdueDays = Math.floor(
                (new Date(DEMO_NOW).getTime() -
                  new Date(`${c.followUpDate}T00:00:00+08:00`).getTime()) /
                  86400000
              );
              const isOverdue = overdueDays > 0;
              return (
                <Link
                  key={c.id}
                  href={`/comms?student=${c.studentId}`}
                  className="block px-4 py-3 hover:bg-ink-50 transition-colors"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <AlertCircle
                      className={`h-4 w-4 shrink-0 ${
                        isOverdue ? "text-mc-red-600" : "text-mc-yellow-600"
                      }`}
                    />
                    <span className="font-semibold text-ink-900 truncate">
                      {student.name}
                    </span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                      {student.grade}
                    </span>
                  </div>
                  <div className="mt-1 ml-6 text-xs text-ink-600 line-clamp-2">
                    {c.briefNotes}
                  </div>
                  <div className="mt-1 ml-6 text-[11px] text-ink-400">
                    {isOverdue
                      ? `Overdue by ${overdueDays}d`
                      : `Due ${c.followUpDate}`}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Module quick links */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-700 uppercase tracking-wide">
          Modules
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <ModuleCard
            href="/sessions"
            Icon={Calendar}
            title="Sessions & Make-up"
            blurb="Attendance, CW/HW, previous-HW check, makeup scheduling."
          />
          <ModuleCard
            href="/students"
            Icon={Users}
            title="Students"
            blurb="Per-student hub — sessions, checktables, comms, history all in one place."
          />
          <ModuleCard
            href="/assessments"
            Icon={ClipboardCheck}
            title="Assessments"
            blurb="Booked → attended → follow-up → enrolled or lost."
          />
          <ModuleCard
            href="/comms"
            Icon={MessageSquare}
            title="Parent Comms"
            blurb="Recent contacts, follow-ups, contact-needed alerts."
          />
        </div>
      </section>
    </div>
  );
}

function StatTile({
  Icon,
  label,
  value,
  sub,
  tone,
  href,
}: {
  Icon: typeof Calendar;
  label: string;
  value: string;
  sub: string;
  tone: "red" | "yellow" | "neutral";
  href: string;
}) {
  const toneCls =
    tone === "red"
      ? "text-mc-red-700 bg-mc-red-50"
      : tone === "yellow"
        ? "text-mc-yellow-600 bg-mc-yellow-50"
        : "text-ink-700 bg-ink-100";
  return (
    <Link
      href={href}
      className="surface-mc p-4 hover:border-mc-line-strong transition-colors block"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-ink-500 font-medium">
          {label}
        </span>
        <span className={`h-7 w-7 rounded-md grid place-items-center ${toneCls}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-ink-900 tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-ink-500">{sub}</div>
    </Link>
  );
}

function PanelHeader({
  title,
  count,
  href,
  tone,
}: {
  title: string;
  count: number;
  href: string;
  tone?: "warn" | "neutral";
}) {
  const countCls =
    tone === "warn"
      ? "bg-mc-red-100 text-mc-red-700"
      : "bg-ink-100 text-ink-700";
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${countCls}`}
        >
          {count}
        </span>
      </div>
      <Link
        href={href}
        className="text-xs text-mc-red-700 hover:underline inline-flex items-center gap-1"
      >
        View all
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function EmptyState({
  Icon,
  title,
  hint,
}: {
  Icon: typeof Calendar;
  title: string;
  hint: string;
}) {
  return (
    <div className="p-6 text-center">
      <Icon className="h-8 w-8 text-ink-300 mx-auto" />
      <div className="mt-2 text-sm font-medium text-ink-700">{title}</div>
      <div className="mt-1 text-xs text-ink-500 max-w-xs mx-auto">{hint}</div>
    </div>
  );
}

function ModuleCard({
  href,
  Icon,
  title,
  blurb,
}: {
  href: string;
  Icon: typeof Calendar;
  title: string;
  blurb: string;
}) {
  return (
    <Link
      href={href}
      className="surface-mc p-4 hover:border-mc-line-strong transition-colors group block"
    >
      <div className="flex items-center gap-2">
        <span className="h-8 w-8 rounded-md bg-mc-red-50 text-mc-red-700 grid place-items-center group-hover:bg-mc-red-100">
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-ink-900">{title}</span>
      </div>
      <p className="mt-2 text-xs text-ink-500 leading-relaxed">{blurb}</p>
    </Link>
  );
}
