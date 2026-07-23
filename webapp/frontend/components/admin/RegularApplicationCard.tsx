"use client";

import React, { useState } from "react";
import {
  StickyNote, Copy, Check, Phone, AlertCircle, Clock, CheckCircle,
  UserCheck, FileInput, Eye, CalendarCheck, GraduationCap, LogOut, XCircle,
  type LucideIcon,
} from "lucide-react";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/lib/formatters";
import { displayLocation, DAY_ABBREV, SUMMER_GRADE_BG } from "@/lib/regular-utils";
import type { RegularApplication } from "@/types";

// Status pill colours, following the summer card's dot/bg/text/borderL scheme
// but for the leaner regular ladder (plus its three side exits).
export const REGULAR_STATUS_COLORS: Record<string, { dot: string; bg: string; text: string; borderL: string }> = {
  "Submitted":          { dot: "bg-gray-400",    bg: "bg-gray-100 dark:bg-gray-800",         text: "text-gray-700 dark:text-gray-300",       borderL: "border-l-gray-400" },
  "Under Review":       { dot: "bg-blue-500",    bg: "bg-blue-50 dark:bg-blue-900/20",       text: "text-blue-700 dark:text-blue-300",       borderL: "border-l-blue-500" },
  "Schedule Confirmed": { dot: "bg-purple-500",  bg: "bg-purple-50 dark:bg-purple-900/20",   text: "text-purple-700 dark:text-purple-300",   borderL: "border-l-purple-500" },
  "Enrolled":           { dot: "bg-green-500",   bg: "bg-green-50 dark:bg-green-900/20",     text: "text-green-700 dark:text-green-300",     borderL: "border-l-green-500" },
  "Waitlisted":         { dot: "bg-orange-500",  bg: "bg-orange-50 dark:bg-orange-900/20",   text: "text-orange-700 dark:text-orange-300",   borderL: "border-l-orange-500" },
  "Withdrawn":          { dot: "bg-slate-400",   bg: "bg-slate-50 dark:bg-slate-800/50",     text: "text-slate-600 dark:text-slate-400",     borderL: "border-l-slate-400" },
  "Rejected":           { dot: "bg-red-500",     bg: "bg-red-50 dark:bg-red-900/20",         text: "text-red-700 dark:text-red-300",         borderL: "border-l-red-500" },
};

export const REGULAR_ALL_STATUSES = [
  "Submitted", "Under Review", "Schedule Confirmed", "Enrolled",
  "Waitlisted", "Withdrawn", "Rejected",
];

export const REGULAR_STATUS_ICONS: Record<string, LucideIcon> = {
  "Submitted":          FileInput,
  "Under Review":       Eye,
  "Schedule Confirmed": CalendarCheck,
  "Enrolled":           GraduationCap,
  "Waitlisted":         Clock,
  "Withdrawn":          LogOut,
  "Rejected":           XCircle,
};

const REGULAR_EXIT_SET = new Set(["Waitlisted", "Withdrawn", "Rejected"]);

// Soft row tints for dense lists (slot card student rows), matching the way
// summer tints a placed session by its status.
const REGULAR_STATUS_ROW_BG: Record<string, string> = {
  "Submitted":          "bg-gray-50 dark:bg-gray-800/30",
  "Under Review":       "bg-blue-50 dark:bg-blue-900/20",
  "Schedule Confirmed": "bg-purple-50 dark:bg-purple-900/20",
  "Enrolled":           "bg-green-50 dark:bg-green-900/20",
  "Waitlisted":         "bg-orange-50/80 dark:bg-orange-900/20",
  "Withdrawn":          "bg-slate-100/80 dark:bg-slate-800/30",
  "Rejected":           "bg-red-50/80 dark:bg-red-900/20",
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

const BRANCH_BADGE: Record<string, string> = {
  MSA: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  MSB: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
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
}

export const RegularApplicationCard = React.memo(function RegularApplicationCard({
  application: app,
  index,
  isFocused = false,
  onSelect,
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
  const isExited = REGULAR_EXIT_SET.has(app.application_status);
  const hasPref1 = !!(app.preference_1_day && app.preference_1_time);
  const hasPref2 = !!(app.preference_2_day && app.preference_2_time);
  const gradeChip = SUMMER_GRADE_BG[app.grade] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  const langChip = app.form_language === "zh" ? "中" : app.form_language === "en" ? "EN" : null;

  return (
    <div
      data-app-index={index}
      onClick={() => onSelect(app)}
      className={cn(
        "group rounded-lg border border-l-[3px] transition-all cursor-pointer scroll-my-24",
        statusBorderL,
        branchTint,
        "hover:bg-muted/40",
        isExited && "opacity-60 hover:opacity-100",
        isFocused && "ring-2 ring-primary/50",
        "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm"
      )}
    >
      <div className="px-3 py-2.5 space-y-1.5">
        {/* Row 1: identity */}
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-sm text-foreground truncate max-w-[220px]">
              {app.student_name}
            </span>
            {app.grade && (
              <span className={cn("shrink-0 text-[10px] px-1.5 py-0.5 rounded font-semibold", gradeChip)}>
                {app.grade}
              </span>
            )}
            {app.lang_stream && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-muted-foreground">
                {app.lang_stream}
              </span>
            )}
            {app.school && (
              <span className="hidden sm:inline text-[11px] text-muted-foreground truncate max-w-[180px]">
                {app.school}
              </span>
            )}
            {app.linked_student && (
              <span
                className="shrink-0 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800"
                title={`Linked to ${app.linked_student.student_name}${app.linked_student.school_student_id ? ` (${app.linked_student.school_student_id})` : ""}`}
              >
                <UserCheck className="h-3 w-3" />
                {app.linked_student.school_student_id || app.linked_student.student_name}
              </span>
            )}
          </div>
          {branchCode && (
            <span className={cn(
              "shrink-0 text-[10px] px-1.5 py-0.5 rounded font-semibold",
              BRANCH_BADGE[branchCode] || "bg-gray-100 text-gray-700"
            )}>
              {branchCode}
            </span>
          )}
          <div className="ml-auto shrink-0 flex items-center gap-1.5">
            <RegularStatusBadge status={app.application_status} />
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

        {/* Row 3: meta footer */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {app.contact_phone && (
            <span className="shrink-0 hidden sm:inline-flex items-center gap-1">
              <Phone className="h-3 w-3 text-blue-600" />
              {app.contact_phone}
            </span>
          )}
          {app.wechat_id && (
            <span className="shrink-0 hidden md:inline-flex items-center gap-1" title={`WeChat: ${app.wechat_id}`}>
              <WeChatIcon className="h-3 w-3 text-green-600" />
              {app.wechat_id}
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
            {app.submitted_at && <span>{formatTimeAgo(app.submitted_at)}</span>}
          </span>
        </div>
      </div>
    </div>
  );
});
