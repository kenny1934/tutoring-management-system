"use client";

import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Users, User, StickyNote, Copy, Check, Phone, CalendarClock, AlertCircle,
  AlertTriangle, ChevronDown,
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
import { usePortalPopover } from "@/hooks/usePortalPopover";
import type { SummerApplication } from "@/types";

const STATUS_COLORS: Record<string, { dot: string; bg: string; text: string; borderL: string }> = {
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

// Buddy group unlocks the discount at 3 members (matches summer/apply form copy:
// "Groups of 3 or more get a group discount"). Max members is also 3.
const BUDDY_UNLOCK_THRESHOLD = 3;

// Branch tint — subtle bg per applying centre, so admins instantly see who's responsible.
const BRANCH_TINT: Record<string, string> = {
  MSA: "bg-blue-50/40 dark:bg-blue-950/20",
  MSB: "bg-purple-50/40 dark:bg-purple-950/20",
};

export { STATUS_COLORS, ALL_STATUSES, STATUS_ICONS };

function StatusBadgeContent({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS["Submitted"];
  const Icon = STATUS_ICONS[status];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", colors.bg, colors.text)}>
      {Icon ? <Icon className="h-3 w-3" /> : <span className={cn("w-1.5 h-1.5 rounded-full", colors.dot)} />}
      {status}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <StatusBadgeContent status={status} />;
}

function InlineStatusSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { triggerRef, menuRef, pos } = usePortalPopover(open, close, { align: "right" });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title="Click to change status"
        className="inline-flex items-center gap-0.5 hover:opacity-80 transition-opacity cursor-pointer"
      >
        <StatusBadgeContent status={value} />
        <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[180px] bg-card border border-border rounded-lg shadow-lg p-1"
          style={{ top: pos.top, right: pos.right }}
          onClick={(e) => e.stopPropagation()}
        >
          {ALL_STATUSES.map((opt) => {
            const colors = STATUS_COLORS[opt];
            const Icon = STATUS_ICONS[opt];
            const isSelected = opt === value;
            return (
              <button
                key={opt}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  if (opt !== value) onChange(opt);
                }}
                className={cn(
                  "flex items-center gap-1.5 w-full text-left text-xs px-2 py-1 rounded transition-all",
                  colors.bg, colors.text,
                  isSelected ? "ring-1 ring-current font-semibold" : "hover:ring-1 hover:ring-current/60",
                  "mb-0.5 last:mb-0"
                )}
              >
                {Icon && <Icon className="h-3 w-3" />}
                {opt}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

interface SummerApplicationCardProps {
  application: SummerApplication;
  index: number;
  isFocused: boolean;
  onSelect: (app: SummerApplication) => void;
  isChecked: boolean;
  onToggleCheck: (id: number) => void;
  showCheckbox: boolean;
  onStatusChange?: (id: number, status: string) => void;
}

export const SummerApplicationCard = React.memo(function SummerApplicationCard({
  application: app,
  index,
  isFocused,
  onSelect,
  isChecked,
  onToggleCheck,
  showCheckbox,
  onStatusChange,
}: SummerApplicationCardProps) {
  const [refCopied, setRefCopied] = useState(false);
  const { combined: prefs } = formatPreferences(app);
  const classified = classifyPrefs(app);
  const fmtSlot = (s: { day: string; time: string }) => `${s.day} ${s.time}`;
  const prefDisplay = classified.isPair
    ? classified.primary.map(fmtSlot).join(" + ")
    : prefs;

  const handleCopyRef = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!app.reference_code) return;
    navigator.clipboard.writeText(app.reference_code);
    setRefCopied(true);
    setTimeout(() => setRefCopied(false), 2000);
  };

  const isExisting = !!app.is_existing_student && app.is_existing_student !== "None";
  const isPlaced = !!app.sessions && app.sessions.length > 0;
  const sessionsPerWeek = app.sessions_per_week ?? 1;
  const buddyGroupSize = app.buddy_group_id ? (app.buddy_siblings?.length ?? 0) + 1 : 0;
  const buddyUnlocked = buddyGroupSize >= BUDDY_UNLOCK_THRESHOLD;
  const branchCode = app.preferred_location ? displayLocation(app.preferred_location) : "";
  const branchTint = BRANCH_TINT[branchCode] || "bg-white dark:bg-gray-900";
  const statusBorderL = STATUS_COLORS[app.application_status]?.borderL || "border-l-gray-300";

  const editedAfterReview =
    !!app.reviewed_at && !!app.updated_at &&
    app.application_status !== "Submitted" &&
    new Date(app.updated_at).getTime() > new Date(app.reviewed_at).getTime();

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
        isFocused && "ring-2 ring-primary/50",
        isChecked
          ? "border-primary !border-l-primary ring-1 ring-primary/30 bg-primary/[0.05]"
          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm"
      )}
    >
      <div className="px-3 py-2.5 space-y-1.5">
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
                  {isExisting ? (
                    <span
                      className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded"
                      title={`Existing student: ${app.is_existing_student}`}
                    >
                      <BadgeCheck className="h-3 w-3" />
                      <span className="font-mono">{app.is_existing_student}</span>
                    </span>
                  ) : (
                    <span
                      className="shrink-0 text-[10px] font-semibold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded"
                      title="New student — no prior enrolment"
                    >
                      New
                    </span>
                  )}
                  {buddyGroupSize > 0 && (
                    <span
                      className={cn(
                        "shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded",
                        buddyUnlocked
                          ? "bg-green-100 dark:bg-green-900/30"
                          : "bg-amber-100 dark:bg-amber-900/30"
                      )}
                      title={
                        (app.buddy_names || `Buddy group of ${buddyGroupSize}`) +
                        (buddyUnlocked
                          ? " — discount unlocked"
                          : ` — needs ${BUDDY_UNLOCK_THRESHOLD - buddyGroupSize} more for discount`)
                      }
                    >
                      {Array.from({ length: BUDDY_UNLOCK_THRESHOLD }).map((_, i) => {
                        const filled = i < buddyGroupSize;
                        return (
                          <User
                            key={i}
                            className={cn(
                              "h-3 w-3",
                              filled
                                ? (buddyUnlocked
                                    ? "text-green-600 dark:text-green-400 fill-green-600 dark:fill-green-400"
                                    : "text-amber-600 dark:text-amber-400 fill-amber-600 dark:fill-amber-400")
                                : "text-muted-foreground/40"
                            )}
                          />
                        );
                      })}
                    </span>
                  )}
                </>
              }
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
          <div className="ml-auto shrink-0">
            {onStatusChange ? (
              <InlineStatusSelect
                value={app.application_status}
                onChange={(next) => onStatusChange(app.id, next)}
              />
            ) : (
              <StatusBadgeContent status={app.application_status} />
            )}
          </div>
        </div>

        {/* Row 2: placement — the action-relevant line */}
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          {isPlaced ? (
            <>
              <GraduationCap className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
              {app.sessions!.map((s, i) => (
                <span
                  key={i}
                  className="shrink-0 font-mono text-[11px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 font-medium"
                >
                  {s.slot_day} {s.time_slot}
                </span>
              ))}
            </>
          ) : classified.primary.length > 0 || prefDisplay ? (
            <>
              <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {sessionsPerWeek > 1 && (
                <span className="shrink-0 text-[10px] font-bold px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                  2×
                </span>
              )}
              {classified.primary.length > 0 ? (
                classified.primary.map((s, i) => (
                  <span
                    key={`p${i}`}
                    className="shrink-0 font-mono text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-foreground"
                  >
                    {s.day} {s.time}
                  </span>
                ))
              ) : (
                <span className="text-foreground truncate">{prefDisplay}</span>
              )}
              {classified.backup.length > 0 && (
                <>
                  <span className="shrink-0 text-[10px] text-muted-foreground/60 uppercase tracking-wide">alt</span>
                  {classified.backup.map((s, i) => (
                    <span
                      key={`b${i}`}
                      className="shrink-0 font-mono text-[11px] px-1.5 py-0.5 rounded border border-dashed border-gray-300 dark:border-gray-700 text-muted-foreground"
                    >
                      {s.day} {s.time}
                    </span>
                  ))}
                </>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
              <AlertCircle className="h-3 w-3" /> No preferences submitted
            </span>
          )}
        </div>

        {/* Row 3: meta footer — phone, wechat, flags, ref, time */}
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
              Sibling pending{(app.pending_sibling_count ?? 0) > 1 ? ` ×${app.pending_sibling_count}` : ""}
            </span>
          )}
          {app.unavailability_notes && (
            <span
              className="shrink-0 inline-flex items-center gap-0.5 text-red-600 dark:text-red-400"
              title={`Unavailable: ${app.unavailability_notes}`}
            >
              <XCircle className="h-2.5 w-2.5" /> Unavailable
            </span>
          )}
          {editedAfterReview && (
            <span
              className="shrink-0 inline-flex items-center gap-0.5 text-red-600 dark:text-red-400 font-medium"
              title={`Edited ${formatTimeAgo(app.updated_at!)} — after review on ${formatTimeAgo(app.reviewed_at!)}`}
            >
              <AlertTriangle className="h-3 w-3" /> Edited after review
            </span>
          )}
          {app.admin_notes && (
            <span
              className="shrink-0 inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 truncate max-w-[220px]"
              title={app.admin_notes}
            >
              <StickyNote className="h-3 w-3 shrink-0" />
              <span className="truncate">{app.admin_notes}</span>
            </span>
          )}
          <span className="ml-auto shrink-0 inline-flex items-center gap-2">
            {langChip && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-muted-foreground" title={`Form filled in ${app.form_language === "zh" ? "Chinese" : "English"}`}>
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
