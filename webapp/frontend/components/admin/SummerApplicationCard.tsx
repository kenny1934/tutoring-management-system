"use client";

import React, { useState } from "react";
import {
  Users, StickyNote, Copy, Check, Phone,
  FileInput, Eye, Send, CheckCircle, CreditCard, BadgeCheck,
  GraduationCap, Clock, LogOut, XCircle,
  type LucideIcon,
} from "lucide-react";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/lib/formatters";
import { formatPreferences, displayLocation } from "@/lib/summer-utils";
import { classifyPrefs } from "@/lib/summer-preferences";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { CopyableCell, BRANCH_COLORS } from "@/components/summer/prospect-badges";
import type { SummerApplication } from "@/types";

const STATUS_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  "Submitted":           { dot: "bg-gray-400",    bg: "bg-gray-100 dark:bg-gray-800",         text: "text-gray-700 dark:text-gray-300" },
  "Under Review":        { dot: "bg-blue-500",    bg: "bg-blue-50 dark:bg-blue-900/20",       text: "text-blue-700 dark:text-blue-300" },
  "Placement Offered":   { dot: "bg-indigo-500",  bg: "bg-indigo-50 dark:bg-indigo-900/20",   text: "text-indigo-700 dark:text-indigo-300" },
  "Placement Confirmed": { dot: "bg-purple-500",  bg: "bg-purple-50 dark:bg-purple-900/20",   text: "text-purple-700 dark:text-purple-300" },
  "Fee Sent":            { dot: "bg-amber-500",   bg: "bg-amber-50 dark:bg-amber-900/20",     text: "text-amber-700 dark:text-amber-300" },
  "Paid":                { dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-700 dark:text-emerald-300" },
  "Enrolled":            { dot: "bg-green-500",   bg: "bg-green-50 dark:bg-green-900/20",     text: "text-green-700 dark:text-green-300" },
  "Waitlisted":          { dot: "bg-orange-500",  bg: "bg-orange-50 dark:bg-orange-900/20",   text: "text-orange-700 dark:text-orange-300" },
  "Withdrawn":           { dot: "bg-slate-400",   bg: "bg-slate-50 dark:bg-slate-800/50",     text: "text-slate-600 dark:text-slate-400" },
  "Rejected":            { dot: "bg-red-500",     bg: "bg-red-50 dark:bg-red-900/20",         text: "text-red-700 dark:text-red-300" },
};

const ALL_STATUSES = [
  "Submitted", "Under Review", "Placement Offered", "Placement Confirmed",
  "Fee Sent", "Paid", "Enrolled", "Waitlisted", "Withdrawn", "Rejected",
];

const STATUS_ICONS: Record<string, LucideIcon> = {
  "Submitted":           FileInput,
  "Under Review":        Eye,
  "Placement Offered":   Send,
  "Placement Confirmed": CheckCircle,
  "Fee Sent":            CreditCard,
  "Paid":                BadgeCheck,
  "Enrolled":            GraduationCap,
  "Waitlisted":          Clock,
  "Withdrawn":           LogOut,
  "Rejected":            XCircle,
};

export { STATUS_COLORS, ALL_STATUSES, STATUS_ICONS };

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS["Submitted"];
  const Icon = STATUS_ICONS[status];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", colors.bg, colors.text)}>
      {Icon ? <Icon className="h-3 w-3" /> : <span className={cn("w-1.5 h-1.5 rounded-full", colors.dot)} />}
      {status}
    </span>
  );
}

export { StatusBadge };

interface SummerApplicationCardProps {
  application: SummerApplication;
  index: number;
  isFocused: boolean;
  onSelect: (app: SummerApplication) => void;
  isChecked: boolean;
  onToggleCheck: (id: number) => void;
  showCheckbox: boolean;
}

export const SummerApplicationCard = React.memo(function SummerApplicationCard({
  application: app,
  index,
  isFocused,
  onSelect,
  isChecked,
  onToggleCheck,
  showCheckbox,
}: SummerApplicationCardProps) {
  const [refCopied, setRefCopied] = useState(false);
  const { combined: prefs } = formatPreferences(app);
  const classified = classifyPrefs(app);
  const fmtSlot = (s: { day: string; time: string }) => `${s.day} ${s.time}`;
  const prefDisplay = classified.isPair
    ? classified.primary.map(fmtSlot).join(" + ")
    : prefs;
  const backupTooltip = classified.isPair && classified.backup.length > 0
    ? classified.backup.map(fmtSlot).join(" + ")
    : null;

  const handleCopyRef = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!app.reference_code) return;
    navigator.clipboard.writeText(app.reference_code);
    setRefCopied(true);
    setTimeout(() => setRefCopied(false), 2000);
  };

  const isExisting = !!app.is_existing_student && app.is_existing_student !== "None";
  const isPlaced = !!app.sessions && app.sessions.length > 0;
  const placedDisplay = isPlaced
    ? app.sessions!.map((s) => `${s.slot_day} ${s.time_slot}`).join(" + ")
    : null;
  const sessionsPerWeek = app.sessions_per_week ?? 1;
  const buddyGroupSize = app.buddy_group_id ? (app.buddy_siblings?.length ?? 0) + 1 : 0;
  const barColor = STATUS_COLORS[app.application_status]?.dot || "bg-gray-300";

  return (
    <div
      data-app-index={index}
      onClick={() => onSelect(app)}
      className={cn(
        "group relative rounded-lg border transition-all cursor-pointer scroll-my-24 overflow-hidden",
        isExisting ? "bg-primary/[0.025] dark:bg-primary/[0.04]" : "bg-white dark:bg-gray-900",
        isFocused && "ring-2 ring-primary/50",
        isChecked
          ? "border-primary ring-1 ring-primary/30"
          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm"
      )}
    >
      {/* Status bar — leftmost cue for triage */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-[3px]", barColor)} aria-hidden />

      <div className="pl-3 pr-3 py-2.5 space-y-1.5">
        {/* Row 1: identity */}
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "shrink-0 transition-opacity -ml-0.5",
              showCheckbox ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
            onClick={(e) => { e.stopPropagation(); onToggleCheck(app.id); }}
          >
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => {}}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
            />
          </div>
          <div className="min-w-0 flex-1">
            <StudentInfoBadges
              student={{
                student_name: app.student_name,
                grade: app.grade,
                lang_stream: app.lang_stream ?? undefined,
                school: app.school ?? undefined,
              }}
              trailing={
                <>
                  {isExisting && (
                    <span
                      className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded"
                      title={`Existing student: ${app.is_existing_student}`}
                    >
                      <BadgeCheck className="h-3 w-3" />
                      <span className="font-mono">{app.is_existing_student}</span>
                    </span>
                  )}
                  {buddyGroupSize > 0 && (
                    <span
                      className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-purple-600 dark:text-purple-400"
                      title={app.buddy_names || `Buddy group of ${buddyGroupSize}`}
                    >
                      <Users className="h-3 w-3" /> ×{buddyGroupSize}
                    </span>
                  )}
                </>
              }
            />
          </div>
          {app.preferred_location && (() => {
            const code = displayLocation(app.preferred_location);
            const color = BRANCH_COLORS[code]?.badge || "bg-gray-100 text-gray-700";
            return (
              <span className={cn("shrink-0 text-[10px] px-1.5 py-0.5 rounded font-semibold", color)}>
                {code}
              </span>
            );
          })()}
          <div className="ml-auto shrink-0">
            <StatusBadge status={app.application_status} />
          </div>
        </div>

        {/* Row 2: placement — the action-relevant line */}
        <div className="flex items-baseline gap-2 text-xs">
          {isPlaced ? (
            <>
              <span className="shrink-0 inline-flex items-center gap-1 text-green-700 dark:text-green-400 font-medium">
                <GraduationCap className="h-3 w-3" />
                Placed
              </span>
              <span className="text-foreground font-medium truncate">{placedDisplay}</span>
            </>
          ) : prefDisplay ? (
            <>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium">
                {sessionsPerWeek > 1 ? `${sessionsPerWeek}× pref` : "Pref"}
              </span>
              <span className="text-foreground truncate">{prefDisplay}</span>
              {backupTooltip && (
                <span
                  className="shrink-0 text-[10px] text-muted-foreground/70 italic"
                  title={`Backup: ${backupTooltip}`}
                >
                  +alt
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground/60 italic">No preferences submitted</span>
          )}
        </div>

        {/* Row 3: meta footer — location, flags, ref, time */}
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
          {(app.pending_sibling_count ?? 0) > 0 && (
            <span
              className="shrink-0 text-amber-700 dark:text-amber-400"
              title="Sibling declared at Primary / KidsConcept — pending verification"
            >
              · Sibling pending{(app.pending_sibling_count ?? 0) > 1 ? ` ×${app.pending_sibling_count}` : ""}
            </span>
          )}
          {app.unavailability_notes && (
            <span
              className="shrink-0 inline-flex items-center gap-0.5 text-red-600 dark:text-red-400"
              title={`Unavailable: ${app.unavailability_notes}`}
            >
              · <XCircle className="h-2.5 w-2.5" /> Unavailable
            </span>
          )}
          {app.admin_notes && (
            <StickyNote className="h-3 w-3 text-amber-500 shrink-0" title={app.admin_notes} />
          )}
          <span className="ml-auto shrink-0 inline-flex items-center gap-2">
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
