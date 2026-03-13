"use client";

import React, { useState } from "react";
import {
  Users, StickyNote, Copy, Check,
  FileInput, Eye, Send, CheckCircle, CreditCard, BadgeCheck,
  GraduationCap, Clock, LogOut, XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/lib/formatters";
import { formatPreferences, displayLocation } from "@/lib/summer-utils";
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

  const handleCopyRef = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!app.reference_code) return;
    navigator.clipboard.writeText(app.reference_code);
    setRefCopied(true);
    setTimeout(() => setRefCopied(false), 2000);
  };

  return (
    <div
      data-app-index={index}
      onClick={() => onSelect(app)}
      className={cn(
        "group rounded-lg border transition-all cursor-pointer scroll-my-24",
        "bg-white dark:bg-gray-900",
        isFocused && "ring-2 ring-primary/50",
        isChecked
          ? "border-primary ring-1 ring-primary/30"
          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm"
      )}
    >
      <div className="px-3 py-2.5 space-y-1">
        {/* Row 1: checkbox + name + ref code + reviewed + status */}
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "shrink-0 transition-opacity",
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
          <span className="font-medium text-sm text-foreground truncate">{app.student_name}</span>
          {/* Ref code with copy on hover */}
          <span className="group/ref inline-flex items-center gap-1 shrink-0">
            <span className="text-xs font-mono text-muted-foreground">{app.reference_code}</span>
            <button
              onClick={handleCopyRef}
              className="p-0.5 text-muted-foreground hover:text-foreground opacity-0 group-hover/ref:opacity-100 transition-opacity"
              title="Copy reference code"
            >
              {refCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </button>
          </span>
          <div className="ml-auto shrink-0">
            <StatusBadge status={app.application_status} />
          </div>
        </div>

        {/* Row 2: grade + lang stream + location + indicators */}
        <div className="flex items-center gap-1.5 pl-6 text-xs text-muted-foreground">
          {app.grade && <span className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{app.grade}</span>}
          {app.lang_stream && <span className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{app.lang_stream}</span>}
          {app.preferred_location && (
            <span className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded truncate max-w-[200px]">{displayLocation(app.preferred_location)}</span>
          )}
          {app.is_existing_student && app.is_existing_student !== "None" && (
            <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px]">Existing</span>
          )}
          {app.admin_notes && (
            <StickyNote className="h-3 w-3 text-amber-500 shrink-0" title={app.admin_notes} />
          )}
        </div>

        {/* Row 3: preferences + time + buddy */}
        <div className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
          {prefs && <span className="truncate">{prefs}</span>}
          <span className="ml-auto shrink-0 flex items-center gap-2">
            {app.buddy_group_id && (
              <span className="inline-flex items-center gap-0.5 text-purple-600 dark:text-purple-400">
                <Users className="h-3 w-3" /> Buddy
              </span>
            )}
            {app.submitted_at && <span>{formatTimeAgo(app.submitted_at)}</span>}
          </span>
        </div>
      </div>
    </div>
  );
});
