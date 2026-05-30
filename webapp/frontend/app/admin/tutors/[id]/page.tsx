"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { AdminPageGuard } from "@/components/auth/AdminPageGuard";
import { EditTutorModal } from "@/components/tutors/EditTutorModal";
import { TutorStatsCard } from "@/components/tutors/TutorStatsCard";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle, useTutor } from "@/lib/hooks";
import { revenueAPI, enrollmentsAPI, sessionsAPI } from "@/lib/api";
import { getInitials } from "@/lib/avatar-utils";
import { getSessionStatusConfig } from "@/lib/session-status";
import { getGradeColor, BONUS_TIERS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { getWeekBounds, toDateString, getDayName, getMonthName } from "@/lib/calendar-utils";
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

// Match the revenue page's money convention (MOP, 2dp) so the same figures read
// consistently across the app.
function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `MOP ${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

// Renders a list capped to a fixed height that scrolls internally (on every
// breakpoint) so a long roster/schedule never balloons the page and the
// two-column layout stays aligned. A bottom fade hints there's more to scroll
// and hides once you reach the end.
function ScrollList<T>({
  items,
  renderItem,
  maxHeightClass = "max-h-80",
}: {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  maxHeightClass?: string;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const [showFade, setShowFade] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const overflowing = el.scrollHeight > el.clientHeight + 1;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    setShowFade(overflowing && !atBottom);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update, items]);

  return (
    <div className="relative">
      <ul
        ref={ref}
        className={cn(
          "divide-y divide-[#efe4d2] dark:divide-[#3a3022] overflow-y-auto overscroll-contain pr-1",
          maxHeightClass
        )}
      >
        {items.map(renderItem)}
      </ul>
      {showFade && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#faf8f5] to-transparent dark:from-[#1a1a1a]" />
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

function TutorProfileInner() {
  const params = useParams();
  const router = useRouter();
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

  const { data: weekSessions } = useSWR(
    Number.isFinite(tutorId) ? ["tutor-week", tutorId, week.from, week.to] : null,
    () => sessionsAPI.getAll({ tutor_id: tutorId, from_date: week.from, to_date: week.to })
  );

  const sortedSchedule = useMemo(() => {
    return [...(weekSessions ?? [])].sort((a, b) => {
      const d = a.session_date.localeCompare(b.session_date);
      return d !== 0 ? d : (a.time_slot || "").localeCompare(b.time_slot || "");
    });
  }, [weekSessions]);

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
      const next: RosterFacets = { ...cur };
      const rec = next as Record<string, string | undefined>;
      for (const k of keys) {
        if (allMatch) delete rec[k];
        else rec[k] = patch[k] as string | undefined;
      }
      return next;
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
  const displayedRoster = useMemo(
    () => sortRoster(facetRoster.filter((e) => matchesSearch(e, search)), sort),
    [facetRoster, search, sort]
  );

  if (tutorLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600" />
      </div>
    );
  }

  if (!tutor) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 text-foreground/60">
        <p>Tutor not found.</p>
        <button
          onClick={() => router.push("/admin/tutors")}
          className="text-sm text-primary hover:underline"
        >
          Back to tutors
        </button>
      </div>
    );
  }

  const picture = tutor.profile_picture?.startsWith("http")
    ? tutor.profile_picture
    : undefined;
  // basic_salary is only present in the API payload for admin-level roles.
  const canSeeCompensation = tutor.basic_salary !== undefined;
  const basicPay = Number(tutor.basic_salary ?? 0);

  return (
    <DeskSurface>
      <PageTransition className="min-h-full p-4 sm:p-6">
        {/* Back link — chip so it stays legible on the desk texture */}
        <Link
          href="/admin/tutors"
          className="inline-flex items-center gap-1.5 mb-4 px-2.5 py-1.5 rounded-lg text-sm font-medium bg-[#faf8f5] dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] text-foreground/80 hover:text-foreground shadow-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          All tutors
        </Link>

        {/* Hero */}
        <div className="rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf8f5] dark:bg-[#1a1a1a] shadow-sm p-6 mb-4">
          <div className="flex items-start gap-5">
            {picture ? (
              <Image
                src={picture}
                alt={tutor.tutor_name}
                width={80}
                height={80}
                className="h-20 w-20 rounded-full object-cover shadow-sm flex-shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center shadow-sm flex-shrink-0">
                <span className="text-2xl font-bold text-primary-foreground">
                  {getInitials(tutor.tutor_name)}
                </span>
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-foreground truncate">
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
                    className="inline-flex items-center gap-1.5 hover:text-foreground"
                  >
                    <Mail className="h-4 w-4" />
                    {tutor.user_email}
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
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-[#d4a574] text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors flex-shrink-0"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </button>
            )}
          </div>
        </div>

        {/* Two-column body */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left rail */}
          <div className="space-y-4">
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

          {/* Right column */}
          <div className="lg:col-span-2 space-y-4">
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
                      {facets.grade && (
                        <FacetChip label={`Grade ${facets.grade}`} onClear={() => clearFacet("grade")} />
                      )}
                      {facets.lang && (
                        <FacetChip label={`Lang ${facets.lang}`} onClear={() => clearFacet("lang")} />
                      )}
                      {facets.school && (
                        <FacetChip label={facets.school} onClear={() => clearFacet("school")} />
                      )}
                      {facets.location && (
                        <FacetChip label={facets.location} onClear={() => clearFacet("location")} />
                      )}
                      {facets.day && (
                        <FacetChip label={facets.day} onClear={() => clearFacet("day")} />
                      )}
                      {facets.time && (
                        <FacetChip
                          label={facets.time.split(" - ")[0]}
                          onClear={() => clearFacet("time")}
                        />
                      )}
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
                <ScrollList
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
                            <span className="flex w-36 flex-shrink-0 items-center justify-end gap-1 whitespace-nowrap">
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
              title={`This week${sortedSchedule.length ? ` · ${sortedSchedule.length} sessions` : ""}`}
              icon={<CalendarDays className="h-3.5 w-3.5" />}
            >
              {!weekSessions ? (
                <p className="text-sm text-foreground/40 py-4 text-center">Loading…</p>
              ) : sortedSchedule.length === 0 ? (
                <p className="text-sm text-foreground/40 py-4 text-center">
                  No sessions scheduled this week.
                </p>
              ) : (
                <ScrollList
                  items={sortedSchedule}
                  renderItem={(s) => {
                    const cfg = getSessionStatusConfig(s.session_status);
                    return (
                      <li key={s.id} className="flex items-center gap-3 py-2.5">
                        <span className="text-xs text-foreground/50 w-14 flex-shrink-0">
                          {getDayName(new Date(s.session_date + "T00:00:00"))} {s.session_date.slice(5)}
                        </span>
                        <span className="text-xs font-medium text-foreground/70 w-28 flex-shrink-0 truncate">
                          {s.time_slot}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-sm text-foreground">
                          {s.student_name || `Student #${s.student_id}`}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 text-xs font-medium flex-shrink-0",
                            cfg.textClass
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", cfg.bgClass)} />
                          {s.session_status}
                        </span>
                      </li>
                    );
                  }}
                />
              )}
            </Card>
          </div>
        </div>
      </PageTransition>

      {isAdmin && (
        <EditTutorModal
          tutor={tutor}
          isOpen={editing}
          onClose={() => setEditing(false)}
          onSaved={(updated) => mutateTutor(updated, { revalidate: false })}
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
