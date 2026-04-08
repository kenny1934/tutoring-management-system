"use client";

import { useState, useRef, useEffect } from "react";
import { Check, Copy } from "lucide-react";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";
import type { ProspectIntention, ProspectOutreachStatus, ProspectStatus } from "@/types";
import { OUTREACH_STATUS_HINTS } from "@/types";

// ---- Shared option lists (used by filter selects, bulk action bar, inline editors) ----

export const OUTREACH_OPTIONS: ProspectOutreachStatus[] = [
  "Not Started",
  "WeChat - Not Found",
  "WeChat - Cannot Add",
  "WeChat - Added",
  "Called",
  "No Response",
];

export const STATUS_OPTIONS: ProspectStatus[] = [
  "New",
  "Contacted",
  "Interested",
  "Applied",
  "Enrolled",
  "Declined",
];

export const INTENTION_OPTIONS: ProspectIntention[] = ["Yes", "No", "Considering"];

// ---- Color maps ----

export const INTENTION_BADGE_COLORS: Record<string, string> = {
  Yes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  No: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Considering: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
};

export const INTENTION_LABELS: Record<ProspectIntention, string> = {
  Yes: "Yes",
  No: "No",
  Considering: "Maybe",
};

export const BRANCH_COLORS: Record<string, { badge: string; selected: string }> = {
  MSA: {
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    selected: "bg-blue-100 border-blue-400 text-blue-700 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-400",
  },
  MSB: {
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    selected: "bg-purple-100 border-purple-400 text-purple-700 dark:bg-purple-900/30 dark:border-purple-600 dark:text-purple-400",
  },
};

export const OUTREACH_BADGE_COLORS: Record<string, string> = {
  "Not Started": "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  "WeChat - Not Found": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "WeChat - Cannot Add": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "WeChat - Added": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Called: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "No Response": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
};

export const STATUS_BADGE_COLORS: Record<string, string> = {
  New: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  Contacted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Interested: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  Applied: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Enrolled: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Declined: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

// ---- Components ----

export function IntentionBadge({ value }: { value: string | null }) {
  const v = value || "Considering";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${INTENTION_BADGE_COLORS[v] || "bg-gray-100"}`}>
      {INTENTION_LABELS[v as ProspectIntention] || v}
    </span>
  );
}

export function OutreachBadge({ status }: { status: ProspectOutreachStatus }) {
  const label = status.startsWith("WeChat - ") ? status.replace("WeChat - ", "") : status;
  const showWeChatIcon = status.startsWith("WeChat");
  return (
    <span
      className={`text-xs px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap inline-flex items-center gap-1 ${OUTREACH_BADGE_COLORS[status] || "bg-gray-100"}`}
      title={OUTREACH_STATUS_HINTS[status]}
    >
      {showWeChatIcon && <WeChatIcon className="h-3 w-3" />}
      {label}
    </span>
  );
}

export function ProspectStatusBadge({ status }: { status: ProspectStatus }) {
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_BADGE_COLORS[status] || "bg-gray-100"}`}>
      {status}
    </span>
  );
}

export function BranchBadges({ branches }: { branches: string[] }) {
  if (!branches || branches.length === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="flex gap-1">
      {branches.map((b, i) => (
        <span key={b} className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${BRANCH_COLORS[b]?.badge || "bg-gray-100"}`}>
          {b}{branches.length > 1 && <span className="opacity-60 ml-0.5">{i === 0 ? "1st" : "2nd"}</span>}
        </span>
      ))}
    </span>
  );
}

export function CopyableCell({ text, title: titleOverride }: { text: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  if (!text) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="group/copy inline-flex items-center gap-1 max-w-full">
      <span className="truncate" title={titleOverride || text}>{text}</span>
      <button
        className="shrink-0 p-0.5 rounded transition-opacity cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(text);
          setCopied(true);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setCopied(false), 1200);
        }}
        title="Copy"
      >
        {copied
          ? <Check className="h-3 w-3 text-green-500" />
          : <Copy className="h-3 w-3 opacity-0 group-hover/copy:opacity-60 transition-opacity text-muted-foreground" />
        }
      </button>
    </span>
  );
}
