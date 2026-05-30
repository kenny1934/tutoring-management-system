"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { AdminPageGuard } from "@/components/auth/AdminPageGuard";
import { EditTutorModal } from "@/components/tutors/EditTutorModal";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/lib/hooks";
import { tutorsAPI, revenueAPI, enrollmentsAPI, sessionsAPI } from "@/lib/api";
import { getInitials } from "@/lib/avatar-utils";
import { getSessionStatusConfig } from "@/lib/session-status";
import { getGradeColor } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Pencil,
  Mail,
  MapPin,
  Users,
  CalendarDays,
  Wallet,
} from "lucide-react";

// --- date helpers (client-side) --------------------------------------------
function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function currentWeekRange(): { from: string; to: string } {
  const d = new Date();
  const day = d.getDay(); // 0 = Sun .. 6 = Sat
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { from: fmtDate(mon), to: fmtDate(sun) };
}

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  }).format(n);
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const PERIOD_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
}).format(new Date());

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
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground/50">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function GlanceRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-sm text-foreground/55">{label}</span>
      <span className="text-sm font-medium text-foreground text-right">{value}</span>
    </div>
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

  const {
    data: tutor,
    isLoading: tutorLoading,
    mutate: mutateTutor,
  } = useSWR(
    Number.isFinite(tutorId) ? ["tutor", tutorId] : null,
    () => tutorsAPI.getById(tutorId)
  );

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

  const locationsTaught = useMemo(() => {
    const set = new Set<string>();
    roster?.forEach((e) => e.location && set.add(e.location));
    weekSessions?.forEach((s) => s.location && set.add(s.location));
    return [...set].sort();
  }, [roster, weekSessions]);

  const sortedSchedule = useMemo(() => {
    return [...(weekSessions ?? [])].sort((a, b) => {
      const d = a.session_date.localeCompare(b.session_date);
      return d !== 0 ? d : (a.time_slot || "").localeCompare(b.time_slot || "");
    });
  }, [weekSessions]);

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

  return (
    <DeskSurface>
      <PageTransition className="min-h-full p-4 sm:p-6">
        {/* Back link */}
        <Link
          href="/admin/tutors"
          className="inline-flex items-center gap-1.5 text-sm text-foreground/60 hover:text-foreground mb-4"
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
            <Card title="At a glance">
              <GlanceRow label="Role" value={tutor.role} />
              <GlanceRow label="Default location" value={tutor.default_location || "—"} />
              <GlanceRow
                label="Locations taught"
                value={locationsTaught.length ? locationsTaught.join(", ") : "—"}
              />
              <GlanceRow label="Active students" value={roster?.length ?? "—"} />
              <GlanceRow label="Sessions this week" value={weekSessions?.length ?? "—"} />
            </Card>

            {canSeeCompensation && (
              <Card title="Compensation" icon={<Wallet className="h-3.5 w-3.5" />}>
                <p className="text-xs text-foreground/45 -mt-2 mb-2">{PERIOD_LABEL}</p>
                <GlanceRow label="Basic salary" value={fmtMoney(tutor.basic_salary)} />
                <GlanceRow label="Session revenue" value={fmtMoney(comp?.session_revenue)} />
                <GlanceRow label="Bonus" value={fmtMoney(comp?.monthly_bonus)} />
                <div className="mt-2 pt-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
                  <GlanceRow
                    label="Total this month"
                    value={
                      <span className="text-base font-bold text-foreground">
                        {fmtMoney(comp?.total_salary ?? tutor.basic_salary)}
                      </span>
                    }
                  />
                </div>
              </Card>
            )}
          </div>

          {/* Right column */}
          <div className="lg:col-span-2 space-y-4">
            <Card
              title={`Students${roster ? ` · ${roster.length} active` : ""}`}
              icon={<Users className="h-3.5 w-3.5" />}
            >
              {!roster ? (
                <p className="text-sm text-foreground/40 py-4 text-center">Loading…</p>
              ) : roster.length === 0 ? (
                <p className="text-sm text-foreground/40 py-4 text-center">
                  No active students.
                </p>
              ) : (
                <ul className="divide-y divide-[#efe4d2] dark:divide-[#3a3022]">
                  {roster.map((e) => (
                    <li key={e.id}>
                      <Link
                        href={`/students/${e.student_id}`}
                        className="flex items-center gap-3 py-2.5 -mx-1 px-1 rounded-lg hover:bg-foreground/5 transition-colors"
                      >
                        <span className="flex-1 min-w-0 truncate text-sm font-medium text-foreground">
                          {e.student_name || `Student #${e.student_id}`}
                        </span>
                        {e.grade && (
                          <span
                            className={cn(
                              "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                              getGradeColor(e.grade, e.lang_stream)
                            )}
                          >
                            {e.grade}
                          </span>
                        )}
                        <span className="text-xs text-foreground/50 w-32 text-right truncate">
                          {[e.assigned_day, e.assigned_time].filter(Boolean).join(" ") || "—"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
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
                <ul className="divide-y divide-[#efe4d2] dark:divide-[#3a3022]">
                  {sortedSchedule.map((s) => {
                    const cfg = getSessionStatusConfig(s.session_status);
                    const dow = WEEKDAY[new Date(s.session_date).getDay()];
                    return (
                      <li key={s.id} className="flex items-center gap-3 py-2.5">
                        <span className="text-xs text-foreground/50 w-14 flex-shrink-0">
                          {dow} {s.session_date.slice(5)}
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
                  })}
                </ul>
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
