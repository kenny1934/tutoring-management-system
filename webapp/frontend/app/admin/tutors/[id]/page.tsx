"use client";

import { useState, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { AdminPageGuard } from "@/components/auth/AdminPageGuard";
import { EditTutorModal } from "@/components/tutors/EditTutorModal";
import { TutorStatsCard } from "@/components/tutors/TutorStatsCard";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle, useTutor } from "@/lib/hooks";
import { revenueAPI, enrollmentsAPI, sessionsAPI } from "@/lib/api";
import { getInitials } from "@/lib/avatar-utils";
import { getSessionStatusConfig, getMainGradeGroup, compareSessionsInSlot } from "@/lib/session-status";
import { getGradeColor, BONUS_TIERS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { getWeekBounds, toDateString, getDayName, getMonthName, isSameDay } from "@/lib/calendar-utils";
import { formatMOP } from "@/lib/formatters";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import type { Session } from "@/types";
import {
  ArrowLeft,
  Pencil,
  Mail,
  MapPin,
  Users,
  CalendarDays,
  Wallet,
  BarChart3,
  ArrowRight,
  GraduationCap,
  Clock,
  Search,
  ArrowUpDown,
  X,
} from "lucide-react";
import { getDisplayPaymentStatus, getPaymentStatusConfig } from "@/lib/enrollment-utils";
import {
  applyFacets,
  matchesSearch,
  sortRoster,
  ROSTER_SORTS,
  type RosterFacets,
  type RosterSort,
} from "@/lib/tutor-roster";

// --- date helpers (client-side) --------------------------------------------
function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// The week containing today, as YYYY-MM-DD strings for the API. Uses the app's
// shared week convention so "this week" matches the rest of the UI.
function currentWeekRange(): { from: string; to: string } {
  const { start, end } = getWeekBounds(new Date());
  return { from: toDateString(start), to: toDateString(end) };
}

// MOP money with a null/undefined → "—" guard, on the shared MOP formatter so
// the figures read consistently across the app.
function fmtMoney(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : formatMOP(n);
}

// "Fri 30 May" — a day header label from a YYYY-MM-DD string, parsed in local
// time so the date never slips across the timezone boundary.
function dayHeaderLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${getDayName(d)} ${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}`;
}

// Counts that classify a session for the week tally / row emphasis.
function isAttendedStatus(status: string): boolean {
  return status.startsWith("Attended");
}
function isUpcomingStatus(status: string): boolean {
  return status === "Scheduled" || status === "Trial Class" || status === "Make-up Class";
}

// Groups a day's already-ordered sessions into consecutive time-slot bands so
// the UI can tint alternating slots.
function groupSessionsBySlot(sessions: Session[]): { slot: string; sessions: Session[] }[] {
  const bands: { slot: string; sessions: Session[] }[] = [];
  for (const s of sessions) {
    const slot = s.time_slot || "";
    const last = bands[bands.length - 1];
    if (last && last.slot === slot) last.sessions.push(s);
    else bands.push({ slot, sessions: [s] });
  }
  return bands;
}

const now = new Date();
const PERIOD_LABEL = `${getMonthName(now)} ${now.getFullYear()}`;
// A tutor's salary (basic + this month's bonus) is paid the following month.
const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const NEXT_PERIOD_LABEL = `${getMonthName(nextMonth)} ${nextMonth.getFullYear()}`;

// --- small presentational pieces -------------------------------------------
function Card({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf8f5] dark:bg-[#1a1a1a] shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-foreground/50">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// Renders a list collapsed to a few rows with a "show more/less" toggle so a
// long roster/agenda stays compact by default; the viewport-scoped column
// scrolls if an expanded list runs past it.
function ExpandableList<T>({
  items,
  renderItem,
  collapsedCount = 8,
}: {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  collapsedCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, collapsedCount);
  const hiddenCount = items.length - collapsedCount;
  return (
    <div>
      <ul className="divide-y divide-[#efe4d2] dark:divide-[#3a3022]">
        {shown.map(renderItem)}
      </ul>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-amber-700 hover:underline dark:text-amber-300"
        >
          {expanded ? "Show less" : `Show ${hiddenCount} more`}
        </button>
      )}
    </div>
  );
}

// A removable chip representing one active roster facet.
function FacetChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
      {label}
      <button
        onClick={onClear}
        aria-label={`Remove ${label} filter`}
        className="-mr-0.5 rounded-full p-0.5 hover:bg-amber-200/60 dark:hover:bg-amber-800/40"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// Active-facet chips, in display order — maps each facet key to its chip label.
const FACET_CHIPS: { key: keyof RosterFacets; label: (v: string) => string }[] = [
  { key: "grade", label: (v) => `Grade ${v}` },
  { key: "lang", label: (v) => `Lang ${v}` },
  { key: "school", label: (v) => v },
  { key: "location", label: (v) => v },
  { key: "day", label: (v) => v },
  { key: "time", label: (v) => v.split(" - ")[0] },
];

function TutorProfileInner() {
  const params = useParams();
  const tutorId = Number(params?.id);
  const { isAdmin } = useAuth();
  const [editing, setEditing] = useState(false);

  const period = currentPeriod();
  const week = useMemo(() => currentWeekRange(), []);

  const { data: tutor, isLoading: tutorLoading, mutate: mutateTutor } =
    useTutor(tutorId);

  usePageTitle(tutor ? tutor.tutor_name : "Tutor");

  const { data: comp } = useSWR(
    Number.isFinite(tutorId) ? ["tutor-comp", tutorId, period] : null,
    () => revenueAPI.getMonthlySummary(tutorId, period)
  );

  const { data: roster } = useSWR(
    Number.isFinite(tutorId) ? ["tutor-roster", tutorId] : null,
    () => enrollmentsAPI.getMyStudents(tutorId)
  );

  const { data: weekSessions, mutate: mutateWeek } = useSWR(
    Number.isFinite(tutorId) ? ["tutor-week", tutorId, week.from, week.to] : null,
    () => sessionsAPI.getAll({ tutor_id: tutorId, from_date: week.from, to_date: week.to })
  );

  const sortedSchedule = useMemo(() => {
    const list = weekSessions ?? [];
    // The dominant grade group per day+slot drives the within-slot order.
    const bySlot = new Map<string, Session[]>();
    for (const s of list) {
      const key = `${s.session_date}|${s.time_slot || ""}`;
      const arr = bySlot.get(key) ?? [];
      arr.push(s);
      bySlot.set(key, arr);
    }
    const slotMainGroup = new Map<string, string>();
    for (const [key, arr] of bySlot) slotMainGroup.set(key, getMainGradeGroup(arr));
    return [...list].sort((a, b) => {
      const d = a.session_date.localeCompare(b.session_date);
      if (d !== 0) return d;
      const t = (a.time_slot || "").split("-")[0].localeCompare((b.time_slot || "").split("-")[0]);
      if (t !== 0) return t;
      // Same day + slot: defer to the shared sessions-page convention.
      const key = `${a.session_date}|${a.time_slot || ""}`;
      return compareSessionsInSlot(a, b, slotMainGroup.get(key) ?? "");
    });
  }, [weekSessions]);

  // Group the week's sessions by day for the agenda, flagging today / past days,
  // and tally how many are done vs. still upcoming for the card header.
  const weekAgenda = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const byDay = new Map<string, Session[]>();
    for (const s of sortedSchedule) {
      const arr = byDay.get(s.session_date) ?? [];
      arr.push(s);
      byDay.set(s.session_date, arr);
    }
    // sortedSchedule is date-ascending, so Map insertion order is chronological.
    const groups = Array.from(byDay.entries()).map(([dateStr, sessions]) => {
      const date = new Date(dateStr + "T00:00:00");
      const isToday = isSameDay(date, today);
      return { dateStr, isToday, isPast: date.getTime() < today.getTime() && !isToday, sessions };
    });
    let done = 0;
    let upcoming = 0;
    for (const s of sortedSchedule) {
      if (isAttendedStatus(s.session_status)) done++;
      else if (isUpcomingStatus(s.session_status)) upcoming++;
    }
    // Today-anchored order: today + upcoming days first (ascending, so the next
    // session is near the top), then past days below, most-recent first.
    const future = groups.filter((g) => !g.isPast);
    const past = groups.filter((g) => g.isPast).reverse();
    return { groups: [...future, ...past], done, upcoming };
  }, [sortedSchedule]);

  const weekTally = (() => {
    const parts: string[] = [];
    if (weekAgenda.done) parts.push(`${weekAgenda.done} done`);
    if (weekAgenda.upcoming) parts.push(`${weekAgenda.upcoming} upcoming`);
    return parts.length ? parts.join(" · ") : `${sortedSchedule.length} sessions`;
  })();

  // Session detail popover, opened from a row and anchored at the click point.
  const [openSession, setOpenSession] = useState<Session | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);

  // Faceted roster: the Quick Stats card is the clickable facet menu and the
  // roster list reflects the selection; search + sort are local list controls.
  const [facets, setFacets] = useState<RosterFacets>({});
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<RosterSort>("school_id");

  // Toggle a facet (or a grade+stream pair): clicking the active value clears
  // it, clicking another sets it.
  const toggleFacet = useCallback((patch: Partial<RosterFacets>) => {
    setFacets((cur) => {
      const keys = Object.keys(patch) as (keyof RosterFacets)[];
      const allMatch = keys.every((k) => cur[k] === patch[k]);
      const next = { ...cur };
      keys.forEach((k) => delete next[k]); // clear the touched dimensions
      return allMatch ? next : { ...next, ...patch }; // re-apply unless toggling off
    });
  }, []);

  const clearFacet = useCallback((k: keyof RosterFacets) => {
    setFacets((cur) => {
      const next = { ...cur };
      delete next[k];
      return next;
    });
  }, []);

  // Facet-filtered roster drives the stats (reflect mode); the visible list
  // additionally applies the free-text search, then sorts.
  const hasFacets = Object.values(facets).some(Boolean);
  const facetRoster = useMemo(() => applyFacets(roster ?? [], facets), [roster, facets]);
  const displayedRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortRoster(facetRoster.filter((e) => matchesSearch(e, q)), sort);
  }, [facetRoster, search, sort]);

  if (tutorLoading) {
    return (
      <DeskSurface fullHeight>
        <div className="flex h-full items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600" />
        </div>
      </DeskSurface>
    );
  }

  if (!tutor) {
    return (
      <DeskSurface fullHeight>
        <div className="flex h-full flex-col items-center justify-center gap-4 text-foreground/60">
          <p>Tutor not found.</p>
          <Link
            href="/admin/tutors"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium bg-[#faf8f5] dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] text-foreground/80 hover:text-foreground shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            All tutors
          </Link>
        </div>
      </DeskSurface>
    );
  }

  const picture = tutor.profile_picture?.startsWith("http")
    ? tutor.profile_picture
    : undefined;
  // basic_salary is only present in the API payload for admin-level roles.
  const canSeeCompensation = tutor.basic_salary !== undefined;
  const basicPay = Number(tutor.basic_salary ?? 0);

  return (
    <DeskSurface fullHeight>
      <div className="flex h-full flex-col overflow-hidden p-4 sm:p-6 animate-fadeIn">
        {/* Back link — chip so it stays legible on the desk texture */}
        <Link
          href="/admin/tutors"
          className="inline-flex flex-shrink-0 self-start items-center gap-1.5 mb-4 px-2.5 py-1.5 rounded-lg text-sm font-medium bg-[#faf8f5] dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] text-foreground/80 hover:text-foreground shadow-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          All tutors
        </Link>

        {/* Hero */}
        <div className="flex-shrink-0 rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf8f5] dark:bg-[#1a1a1a] shadow-sm p-4 sm:p-6 mb-4">
          <div className="flex items-start gap-3 sm:gap-5">
            {picture ? (
              <Image
                src={picture}
                alt={tutor.tutor_name}
                width={80}
                height={80}
                className="h-16 w-16 sm:h-20 sm:w-20 rounded-full object-cover shadow-sm flex-shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-primary flex items-center justify-center shadow-sm flex-shrink-0">
                <span className="text-2xl font-bold text-primary-foreground">
                  {getInitials(tutor.tutor_name)}
                </span>
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">
                {tutor.tutor_name}
              </h1>
              <div className="mt-1 flex items-center gap-2 flex-wrap text-sm">
                {tutor.nickname && (
                  <span className="text-foreground/60">“{tutor.nickname}”</span>
                )}
                <span className="text-amber-700 dark:text-amber-400 font-medium">
                  {tutor.role}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    tutor.is_active_tutor === false
                      ? "text-foreground/40"
                      : "text-emerald-600 dark:text-emerald-400"
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      tutor.is_active_tutor === false ? "bg-gray-400" : "bg-emerald-500"
                    )}
                  />
                  {tutor.is_active_tutor === false ? "Inactive" : "Active"}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-4 flex-wrap text-sm text-foreground/60">
                {tutor.user_email && (
                  <a
                    href={`mailto:${tutor.user_email}`}
                    title={tutor.user_email}
                    className="inline-flex min-w-0 max-w-full items-center gap-1.5 hover:text-foreground"
                  >
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{tutor.user_email}</span>
                  </a>
                )}
                {tutor.default_location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {tutor.default_location}
                  </span>
                )}
              </div>
            </div>

            {isAdmin && (
              <button
                onClick={() => setEditing(true)}
                aria-label="Edit tutor"
                className="inline-flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 text-sm font-medium rounded-lg border border-[#d4a574] text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors flex-shrink-0"
              >
                <Pencil className="h-4 w-4" />
                <span className="hidden sm:inline">Edit</span>
              </button>
            )}
          </div>
        </div>

        {/* Two-column body — fills the remaining viewport height; on desktop it's
            a flex row whose columns are height-bounded, so each scrolls on its
            own and the page itself never grows */}
        <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto lg:flex-row lg:overflow-hidden">
          {/* Left rail — fixed third of the row; scrolls on its own if it overflows */}
          <div className="space-y-4 lg:w-1/3 lg:flex-shrink-0 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <Card
              title="Quick stats"
              icon={<BarChart3 className="h-3.5 w-3.5" />}
              action={
                hasFacets ? (
                  <button
                    onClick={() => setFacets({})}
                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline dark:text-amber-300"
                  >
                    <X className="h-3 w-3" />
                    Clear filters
                  </button>
                ) : undefined
              }
            >
              {!roster ? (
                <p className="py-2 text-sm text-foreground/40">Loading…</p>
              ) : (
                <TutorStatsCard roster={facetRoster} facets={facets} onToggle={toggleFacet} />
              )}
            </Card>

            {canSeeCompensation && (
              <Card title="Compensation" icon={<Wallet className="h-3.5 w-3.5" />}>
                {/* Salary = basic + this month's bonus, paid the following month */}
                <span className="text-sm text-foreground/55">
                  Salary for {NEXT_PERIOD_LABEL}
                </span>
                {comp === undefined ? (
                  <div className="my-1 h-7 w-36 animate-pulse rounded bg-foreground/10" />
                ) : (
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                    {fmtMoney(comp.total_salary ?? basicPay)}
                  </p>
                )}
                <p className="text-[11px] text-foreground/40">
                  Based on {PERIOD_LABEL}, paid the following month.
                </p>

                <div className="mt-3 space-y-2.5">
                  {/* Basic */}
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-foreground/55">Basic</span>
                    <span className="text-sm font-medium text-foreground">
                      {fmtMoney(tutor.basic_salary)}
                    </span>
                  </div>

                  {/* Bonus, with the session revenue that drives it as its caption */}
                  <div>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-foreground/55">Bonus</span>
                      <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        {fmtMoney(comp?.monthly_bonus)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-foreground/40">
                      {comp
                        ? `On ${fmtMoney(comp.session_revenue)} session revenue`
                        : "From this month's session revenue"}
                    </p>
                  </div>
                </div>

                {/* Bonus tiers */}
                <details className="mt-3 pt-3 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
                  <summary className="text-xs text-foreground/55 cursor-pointer hover:text-foreground">
                    How the bonus is calculated
                  </summary>
                  <div className="mt-2 text-[11px] text-foreground/55 pl-3">
                    <p className="mb-1 text-foreground/40">
                      Each revenue band is paid at its own rate:
                    </p>
                    <div className="space-y-0.5">
                      {BONUS_TIERS.map(([range, pct]) => (
                        <div key={range} className="flex justify-between gap-3">
                          <span>{range}</span>
                          <span className="font-medium">{pct}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>

                {isAdmin && (
                  <Link
                    href={`/revenue?view=detail&tutor=${tutorId}&period=${period}`}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline dark:text-amber-300"
                  >
                    View full breakdown
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </Card>
            )}
          </div>

          {/* Right column — takes the rest of the row and scrolls within it; cards
              sit at natural height so the first card always shows in full */}
          <div className="space-y-4 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <Card
              title={`Students${roster ? ` · ${roster.length} active` : ""}`}
              icon={<Users className="h-3.5 w-3.5" />}
            >
              {roster && roster.length > 0 && (
                <div className="mb-3 space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
                      <input
                        type="text"
                        value={search}
                        onChange={(ev) => setSearch(ev.target.value)}
                        placeholder="Search name, school, ID…"
                        className="w-full rounded-lg border border-foreground/15 bg-white py-1.5 pl-8 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:bg-[#231d14]"
                      />
                    </div>
                    <div className="relative">
                      <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
                      <select
                        value={sort}
                        onChange={(ev) => setSort(ev.target.value as RosterSort)}
                        className="w-full rounded-lg border border-foreground/15 bg-white py-1.5 pl-8 pr-7 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 sm:w-auto dark:bg-[#231d14]"
                      >
                        {ROSTER_SORTS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {(search || hasFacets) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-foreground/45">
                        {displayedRoster.length} of {roster.length}
                      </span>
                      {FACET_CHIPS.map(({ key, label }) => {
                        const v = facets[key];
                        return v ? (
                          <FacetChip key={key} label={label(v)} onClear={() => clearFacet(key)} />
                        ) : null;
                      })}
                      {hasFacets && (
                        <button
                          onClick={() => setFacets({})}
                          className="text-xs font-medium text-foreground/50 hover:text-foreground"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {!roster ? (
                <p className="text-sm text-foreground/40 py-4 text-center">Loading…</p>
              ) : roster.length === 0 ? (
                <p className="text-sm text-foreground/40 py-4 text-center">
                  No active students.
                </p>
              ) : displayedRoster.length === 0 ? (
                <p className="py-6 text-center text-sm text-foreground/40">
                  No students match your search or filters.
                </p>
              ) : (
                <ExpandableList
                  collapsedCount={5}
                  items={displayedRoster}
                  renderItem={(e) => {
                    const payStatus = getDisplayPaymentStatus(e);
                    const payCfg = getPaymentStatusConfig(payStatus);
                    const schedule = [e.assigned_day, e.assigned_time].filter(Boolean).join(" ");
                    return (
                      <li key={e.id}>
                        <Link
                          href={`/students/${e.student_id}`}
                          className="block py-2.5 -mx-1 px-1 rounded-lg hover:bg-foreground/5 transition-colors"
                        >
                          {/* Line 1: id · name · payment */}
                          <div className="flex items-center gap-2">
                            {e.school_student_id && (
                              <span className="flex-shrink-0 font-mono text-[11px] text-foreground/40">
                                {e.school_student_id}
                              </span>
                            )}
                            <span className="flex-1 min-w-0 truncate text-sm font-medium text-foreground">
                              {e.student_name || `Student #${e.student_id}`}
                            </span>
                            {payStatus && (
                              <span
                                className={cn(
                                  "flex-shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-foreground/70",
                                  payCfg.bgTint
                                )}
                                title={`Payment: ${payStatus}`}
                              >
                                <span className={cn("h-1.5 w-1.5 rounded-full", payCfg.bgClass)} />
                                {payStatus}
                              </span>
                            )}
                          </div>
                          {/* Line 2: grade+lang chip · school · schedule —
                              fixed-width columns so they line up vertically
                              across rows */}
                          <div className="mt-1 flex items-center gap-2 text-xs text-foreground/45">
                            <span className="w-9 flex-shrink-0">
                              {e.grade && (
                                <span
                                  className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold text-gray-800"
                                  style={{ backgroundColor: getGradeColor(e.grade, e.lang_stream) }}
                                >
                                  {e.grade}
                                  {e.lang_stream || ""}
                                </span>
                              )}
                            </span>
                            <span className="flex min-w-0 flex-1 items-center gap-1">
                              {e.school && (
                                <>
                                  <GraduationCap className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">{e.school}</span>
                                </>
                              )}
                            </span>
                            <span className="hidden w-36 flex-shrink-0 items-center justify-end gap-1 whitespace-nowrap sm:flex">
                              {schedule && (
                                <>
                                  <Clock className="h-3 w-3 flex-shrink-0" />
                                  {schedule}
                                </>
                              )}
                            </span>
                          </div>
                        </Link>
                      </li>
                    );
                  }}
                />
              )}
            </Card>

            <Card
              title={`This week${sortedSchedule.length ? ` · ${weekTally}` : ""}`}
              icon={<CalendarDays className="h-3.5 w-3.5" />}
            >
              {!weekSessions ? (
                <p className="text-sm text-foreground/40 py-4 text-center">Loading…</p>
              ) : sortedSchedule.length === 0 ? (
                <p className="text-sm text-foreground/40 py-4 text-center">
                  No sessions scheduled this week.
                </p>
              ) : (
                <ExpandableList
                  collapsedCount={2}
                  items={weekAgenda.groups}
                  renderItem={(g) => (
                    <li key={g.dateStr} className={cn("py-2", g.isPast && "opacity-55")}>
                      {/* Day header — today is accented and pinned with a pill */}
                      <div className="mb-1 flex items-center gap-2">
                        <span
                          className={cn(
                            "text-[11px] font-semibold uppercase tracking-wide",
                            g.isToday ? "text-amber-700 dark:text-amber-300" : "text-foreground/45"
                          )}
                        >
                          {dayHeaderLabel(g.dateStr)}
                        </span>
                        {g.isToday && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            Today
                          </span>
                        )}
                        <span className="ml-auto text-[11px] text-foreground/35">
                          {g.sessions.length}
                        </span>
                      </div>
                      {/* Sessions for the day — fixed-width columns so time, grade,
                          lesson and status line up across rows; click opens the
                          session detail popover anchored at the cursor */}
                      <div className="space-y-1">
                        {groupSessionsBySlot(g.sessions).map((band, bandIdx) => (
                          <div
                            key={band.slot}
                            className={cn(
                              "rounded-lg",
                              bandIdx % 2 === 1 && "bg-foreground/[0.035] dark:bg-white/[0.04]"
                            )}
                          >
                            {band.sessions.map((s) => {
                              const cfg = getSessionStatusConfig(s.session_status);
                              const StatusIcon = cfg.Icon;
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={(ev) => {
                                    setPopoverPos({ x: ev.clientX, y: ev.clientY });
                                    setOpenSession(s);
                                  }}
                                  className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-foreground/5 sm:flex-nowrap"
                                >
                                  <span className="order-1 w-auto flex-shrink-0 whitespace-nowrap font-mono text-[11px] text-foreground/55 sm:w-24">
                                    {s.time_slot}
                                  </span>
                                  <span className="order-2 w-9 flex-shrink-0">
                                    {s.grade && (
                                      <span
                                        className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold text-gray-800"
                                        style={{ backgroundColor: getGradeColor(s.grade, s.lang_stream) }}
                                      >
                                        {s.grade}
                                        {s.lang_stream || ""}
                                      </span>
                                    )}
                                  </span>
                                  <span className="order-3 w-7 flex-shrink-0 text-[10px] font-medium text-foreground/40">
                                    {s.lesson_number != null ? `L${s.lesson_number}` : ""}
                                  </span>
                                  {s.school_student_id && (
                                    <span className="order-4 flex-shrink-0 font-mono text-[11px] text-foreground/40">
                                      {s.school_student_id}
                                    </span>
                                  )}
                                  <span
                                    className={cn(
                                      "order-6 min-w-0 flex-1 basis-full truncate text-sm text-foreground sm:order-5 sm:basis-auto",
                                      cfg.strikethrough && "text-foreground/45 line-through"
                                    )}
                                  >
                                    {s.student_name || `Student #${s.student_id}`}
                                  </span>
                                  <span
                                    className={cn(
                                      "order-5 ml-auto flex flex-shrink-0 items-center gap-1 text-xs font-medium sm:order-6 sm:ml-0",
                                      cfg.textClass
                                    )}
                                  >
                                    <StatusIcon className={cn("h-3.5 w-3.5", cfg.iconClass)} />
                                    <span className="hidden whitespace-nowrap sm:inline">
                                      {s.session_status}
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </li>
                  )}
                />
              )}
            </Card>
          </div>
        </div>
      </div>

      {isAdmin && (
        <EditTutorModal
          tutor={tutor}
          isOpen={editing}
          onClose={() => setEditing(false)}
          onSaved={(updated) => mutateTutor(updated, { revalidate: false })}
        />
      )}

      {openSession && (
        <SessionDetailPopover
          session={openSession}
          isOpen={!!openSession}
          clickPosition={popoverPos}
          onClose={() => {
            setOpenSession(null);
            mutateWeek();
          }}
        />
      )}
    </DeskSurface>
  );
}

export default function TutorProfilePage() {
  return (
    <AdminPageGuard accessDeniedMessage="Admin access required to view tutor profiles">
      <TutorProfileInner />
    </AdminPageGuard>
  );
}
