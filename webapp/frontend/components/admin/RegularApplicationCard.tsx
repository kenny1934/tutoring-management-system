"use client";

import React, { useState } from "react";
import {
  StickyNote, Copy, Check, Phone, AlertCircle, AlertTriangle,
  Clock, CheckCircle, Grid3X3,
  FileInput, Eye, CalendarCheck, GraduationCap, LogOut, XCircle,
  Send, CreditCard, BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/lib/formatters";
import { displayLocation, DAY_ABBREV, REGULAR_EXIT_STATUSES } from "@/lib/regular-utils";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { CopyableCell, BRANCH_COLORS } from "@/components/summer/prospect-badges";
import { LinkedStudentChip } from "@/components/admin/LinkedStudentChip";
import { InlineStatusSelect } from "@/components/admin/InlineStatusSelect";
import type { RegularApplication } from "@/types";

// Status pill colours, matching the summer card's dot/bg/text/borderL scheme
// rung for rung — the two intakes share one ladder.
export const REGULAR_STATUS_COLORS: Record<string, { dot: string; bg: string; text: string; borderL: string }> = {
  "Submitted":           { dot: "bg-gray-400",    bg: "bg-gray-100 dark:bg-gray-800",         text: "text-gray-700 dark:text-gray-300",       borderL: "border-l-gray-400" },
  "Under Review":        { dot: "bg-blue-500",    bg: "bg-blue-50 dark:bg-blue-900/20",       text: "text-blue-700 dark:text-blue-300",       borderL: "border-l-blue-500" },
  "Placement Offered":   { dot: "bg-indigo-500",  bg: "bg-indigo-50 dark:bg-indigo-900/20",   text: "text-indigo-700 dark:text-indigo-300",   borderL: "border-l-indigo-500" },
  "Placement Confirmed": { dot: "bg-purple-500",  bg: "bg-purple-50 dark:bg-purple-900/20",   text: "text-purple-700 dark:text-purple-300",   borderL: "border-l-purple-500" },
  "Fee Sent":            { dot: "bg-amber-500",   bg: "bg-amber-50 dark:bg-amber-900/20",     text: "text-amber-700 dark:text-amber-300",     borderL: "border-l-amber-500" },
  "Paid":                { dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-700 dark:text-emerald-300", borderL: "border-l-emerald-500" },
  "Enrolled":            { dot: "bg-green-500",   bg: "bg-green-50 dark:bg-green-900/20",     text: "text-green-700 dark:text-green-300",     borderL: "border-l-green-500" },
  "Waitlisted":          { dot: "bg-orange-500",  bg: "bg-orange-50 dark:bg-orange-900/20",   text: "text-orange-700 dark:text-orange-300",   borderL: "border-l-orange-500" },
  "Withdrawn":           { dot: "bg-slate-400",   bg: "bg-slate-50 dark:bg-slate-800/50",     text: "text-slate-600 dark:text-slate-400",     borderL: "border-l-slate-400" },
  "Rejected":            { dot: "bg-red-500",     bg: "bg-red-50 dark:bg-red-900/20",         text: "text-red-700 dark:text-red-300",         borderL: "border-l-red-500" },
};

export const REGULAR_ALL_STATUSES = [
  "Submitted", "Under Review", "Placement Offered", "Placement Confirmed",
  "Fee Sent", "Paid", "Enrolled", "Waitlisted", "Withdrawn", "Rejected",
];

export const REGULAR_STATUS_ICONS: Record<string, LucideIcon> = {
  "Submitted":           FileInput,
  "Under Review":        Eye,
  "Placement Offered":   Send,
  "Placement Confirmed": CalendarCheck,
  "Fee Sent":            CreditCard,
  "Paid":                BadgeCheck,
  "Enrolled":            GraduationCap,
  "Waitlisted":          Clock,
  "Withdrawn":           LogOut,
  "Rejected":            XCircle,
};

// Soft row tints for dense lists (slot card student rows), matching the way
// summer tints a placed session by its status.
const REGULAR_STATUS_ROW_BG: Record<string, string> = {
  "Submitted":           "bg-gray-50 dark:bg-gray-800/30",
  "Under Review":        "bg-blue-50 dark:bg-blue-900/20",
  "Placement Offered":   "bg-indigo-50 dark:bg-indigo-900/20",
  "Placement Confirmed": "bg-purple-50 dark:bg-purple-900/20",
  "Fee Sent":            "bg-amber-50 dark:bg-amber-900/20",
  "Paid":                "bg-emerald-50 dark:bg-emerald-900/20",
  "Enrolled":            "bg-green-50 dark:bg-green-900/20",
  "Waitlisted":          "bg-orange-50/80 dark:bg-orange-900/20",
  "Withdrawn":           "bg-slate-100/80 dark:bg-slate-800/30",
  "Rejected":            "bg-red-50/80 dark:bg-red-900/20",
};

export function regularStatusRowBg(status: string): string {
  return REGULAR_STATUS_ROW_BG[status] ?? "bg-gray-50 dark:bg-gray-800/30";
}

/** Bare status icon for dense rows, where a full badge would not fit. */
export function RegularWorkflowStatusIcon({
  status,
  className,
}: {
  status?: string | null;
  className?: string;
}) {
  if (!status) return null;
  const colors = REGULAR_STATUS_COLORS[status];
  const Icon = REGULAR_STATUS_ICONS[status];
  if (!Icon) return null;
  return (
    <span title={status} className="inline-flex shrink-0">
      <Icon className={cn("h-3 w-3", colors?.text, className)} />
    </span>
  );
}

// Subtle background tint per applying branch, matching the summer card.
const BRANCH_TINT: Record<string, string> = {
  MSA: "bg-blue-50/40 dark:bg-blue-950/20",
  MSB: "bg-purple-50/40 dark:bg-purple-950/20",
};

export function RegularStatusBadge({ status }: { status: string }) {
  const colors = REGULAR_STATUS_COLORS[status] || REGULAR_STATUS_COLORS["Submitted"];
  const Icon = REGULAR_STATUS_ICONS[status];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", colors.bg, colors.text)}>
      {Icon ? <Icon className="h-3 w-3" /> : <span className={cn("w-1.5 h-1.5 rounded-full", colors.dot)} />}
      {status}
    </span>
  );
}

/** The origin badge, in the same slot summer's PrimaryBranchChip occupies:
 *  the linked student record if there is one, else what the applicant told us.
 *  Regular has no prospect linkage and no branch verification, so the claim
 *  stays unqualified until an admin links a record. */
/** Where this applicant came from: the linked student record, an
 *  unverified claim of one, or a genuinely new student. */
export function RegularOriginChip({ app }: { app: RegularApplication }) {
  if (app.linked_student) {
    return <LinkedStudentChip student={app.linked_student} />;
  }

  const claimsExisting = !!app.is_existing_student && app.is_existing_student !== "None";
  if (claimsExisting) {
    const centres = (app.current_centers || []).join(", ");
    return (
      <span
        className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 px-1.5 py-0.5 rounded"
        title={
          `Applicant says they attend ${app.is_existing_student}` +
          (centres ? ` (${centres})` : "") +
          ". No student record linked yet."
        }
        onClick={(e) => e.stopPropagation()}
      >
        Claims: existing
      </span>
    );
  }

  return (
    <span
      className="shrink-0 text-[10px] font-semibold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded"
      title="New student. No prior enrolment."
      onClick={(e) => e.stopPropagation()}
    >
      New
    </span>
  );
}

function PrefChip({ day, time, backup }: { day: string; time: string; backup?: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 font-mono text-[11px] px-1.5 py-0.5 rounded",
        backup
          ? "border border-dashed border-gray-300 dark:border-gray-700 text-muted-foreground"
          : "bg-gray-100 dark:bg-gray-800 text-foreground"
      )}
    >
      {DAY_ABBREV[day] || day} {time}
    </span>
  );
}

interface RegularApplicationCardProps {
  application: RegularApplication;
  index: number;
  isFocused?: boolean;
  onSelect: (app: RegularApplication) => void;
  isChecked?: boolean;
  onToggleCheck?: (id: number) => void;
  showCheckbox?: boolean;
  onStatusChange?: (id: number, status: string) => void;
}

export const RegularApplicationCard = React.memo(function RegularApplicationCard({
  application: app,
  index,
  isFocused = false,
  onSelect,
  isChecked = false,
  onToggleCheck,
  showCheckbox = false,
  onStatusChange,
}: RegularApplicationCardProps) {
  const [refCopied, setRefCopied] = useState(false);

  const handleCopyRef = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!app.reference_code) return;
    navigator.clipboard.writeText(app.reference_code);
    setRefCopied(true);
    setTimeout(() => setRefCopied(false), 2000);
  };

  const branchCode = app.preferred_location ? displayLocation(app.preferred_location) : "";
  const branchTint = BRANCH_TINT[branchCode] || "bg-white dark:bg-gray-900";
  const statusBorderL = REGULAR_STATUS_COLORS[app.application_status]?.borderL || "border-l-gray-300";
  const isExited = REGULAR_EXIT_STATUSES.has(app.application_status);
  const hasPref1 = !!(app.preference_1_day && app.preference_1_time);
  const hasPref2 = !!(app.preference_2_day && app.preference_2_time);
  const slot = app.assigned_slot;
  const langChip = app.form_language === "zh" ? "中" : app.form_language === "en" ? "EN" : null;

  const editedAfterReview =
    !!app.reviewed_at && !!app.updated_at &&
    app.application_status !== "Submitted" &&
    new Date(app.updated_at).getTime() > new Date(app.reviewed_at).getTime();

  return (
    <div
      data-app-index={index}
      onClick={() => onSelect(app)}
      className={cn(
        "group rounded-lg border border-l-[3px] transition-all cursor-pointer scroll-my-24",
        statusBorderL,
        branchTint,
        "hover:bg-muted/40",
        isExited && !isChecked && "opacity-60 hover:opacity-100",
        isFocused && "ring-2 ring-primary/50",
        isChecked
          ? "border-primary !border-l-primary ring-1 ring-primary/30 bg-primary/[0.05]"
          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm"
      )}
    >
      <div className="px-3 py-2.5 space-y-1.5">
        {/* Row 1: identity */}
        <div className="flex items-center gap-2">
          {onToggleCheck && (
            <div
              className={cn(
                "shrink-0 transition-opacity -ml-0.5",
                showCheckbox ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => { e.stopPropagation(); onToggleCheck(app.id); }}
                aria-label={`Select ${app.student_name}`}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <StudentInfoBadges
              gradeIsEntering
              student={{
                student_name: app.student_name,
                grade: app.grade,
                lang_stream: app.lang_stream ?? undefined,
                school: app.school ?? undefined,
              }}
              trailing={<RegularOriginChip app={app} />}
            />
          </div>
          {branchCode && (
            <span className={cn(
              "shrink-0 text-[10px] px-1.5 py-0.5 rounded font-semibold",
              BRANCH_COLORS[branchCode]?.badge || "bg-gray-100 text-gray-700"
            )}>
              {branchCode}
            </span>
          )}
          <div className="ml-auto shrink-0 flex items-center gap-1.5">
            {onStatusChange ? (
              <InlineStatusSelect
                value={app.application_status}
                onChange={(next) => onStatusChange(app.id, next)}
                statuses={REGULAR_ALL_STATUSES}
                colors={REGULAR_STATUS_COLORS}
                icons={REGULAR_STATUS_ICONS}
                badge={<RegularStatusBadge status={app.application_status} />}
              />
            ) : (
              <RegularStatusBadge status={app.application_status} />
            )}
            {app.published_enrollment_id && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                title={`Published as enrollment #${app.published_enrollment_id}`}
              >
                <CheckCircle className="h-3 w-3" />
                Published
              </span>
            )}
          </div>
        </div>

        {/* Row 2: weekly slot preferences */}
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          {hasPref1 || hasPref2 ? (
            <>
              <Clock className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              {hasPref1 && <PrefChip day={app.preference_1_day!} time={app.preference_1_time!} />}
              {hasPref2 && (
                <>
                  <span className="shrink-0 text-[10px] text-muted-foreground/60 uppercase tracking-wide">alt</span>
                  <PrefChip day={app.preference_2_day!} time={app.preference_2_time!} backup />
                </>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
              <AlertCircle className="h-3 w-3" /> No preferences submitted
            </span>
          )}
        </div>

        {/* Row 2b: the assigned class, once the arrangement page has placed
            this student. Regular's counterpart to summer's placement strip. */}
        {slot && (
          <div className="flex items-center gap-1.5 text-xs flex-wrap">
            <Grid3X3 className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
            <span className="shrink-0 font-mono text-[11px] px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-900/20 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
              {DAY_ABBREV[slot.slot_day] || slot.slot_day} {slot.time_slot}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {displayLocation(slot.location) || slot.location}
            </span>
            {slot.tutor_name ? (
              <span className="shrink-0 text-[11px] text-muted-foreground truncate max-w-[140px]">
                {slot.tutor_name}
              </span>
            ) : (
              <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" /> No tutor set
              </span>
            )}
          </div>
        )}

        {/* Row 3: meta footer */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {app.contact_phone && (
            <span className="shrink-0 hidden sm:inline-flex items-center gap-1">
              <Phone className="h-3 w-3 text-blue-600" />
              <CopyableCell text={app.contact_phone} />
            </span>
          )}
          {app.wechat_id && (
            <span className="shrink-0 hidden md:inline-flex items-center gap-1">
              <WeChatIcon className="h-3 w-3 text-green-600" />
              <CopyableCell text={app.wechat_id} title={`WeChat: ${app.wechat_id}`} />
            </span>
          )}
          {editedAfterReview && (
            <span
              className="shrink-0 inline-flex items-center gap-0.5 text-red-600 dark:text-red-400 font-medium"
              title={`Edited ${formatTimeAgo(app.updated_at!)}. Reviewed ${formatTimeAgo(app.reviewed_at!)}.`}
            >
              <AlertTriangle className="h-3 w-3" /> Edited after review
            </span>
          )}
          {app.admin_notes && (
            <span
              className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 min-w-0"
              title={app.admin_notes}
            >
              <StickyNote className="h-3 w-3 shrink-0" />
              <span className="truncate">{app.admin_notes}</span>
            </span>
          )}
          <span className="ml-auto shrink-0 inline-flex items-center gap-2">
            {langChip && (
              <span
                className="text-[10px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-muted-foreground"
                title={`Form filled in ${app.form_language === "zh" ? "Chinese" : "English"}`}
              >
                {langChip}
              </span>
            )}
            <span className="inline-flex items-center gap-1 font-mono">
              {app.reference_code}
              <button
                onClick={handleCopyRef}
                className="p-0.5 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                title="Copy reference code"
              >
                {refCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              </button>
            </span>
            {app.application_status !== "Submitted" && app.reviewed_at ? (
              <span title={app.submitted_at ? `Submitted ${formatTimeAgo(app.submitted_at)}` : undefined}>
                Reviewed {formatTimeAgo(app.reviewed_at)}
              </span>
            ) : app.submitted_at ? (
              <span>{formatTimeAgo(app.submitted_at)}</span>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
});
