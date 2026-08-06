"use client";

import { cn } from "@/lib/utils";
import { ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { BRANCH_INFO, displayLocation } from "@/lib/regular-utils";
import { GradeLabel } from "@/components/ui/grade-label";
import type {
  AutoMatchEntry,
  AutoMatchSkipEntry,
  AutoMatchSkipReason,
  AutoMatchProspectSummary,
  AutoMatchAppSummary,
  StudentLinkMatch,
  StudentLinkSkipEntry,
  StudentLinkAppSummary,
  StudentSuggestionCandidate,
} from "@/types";

/**
 * Row and chip primitives for the two "Link suggestions" modals, summer's
 * ApplicationLinkSuggestionsModal and regular's RegularLinkSuggestionsModal.
 *
 * The modals themselves stay separate: they call different endpoints and the
 * summer one carries a placement vocabulary regular has no equivalent for. What
 * they genuinely share is this presentation, which sat duplicated in both files
 * long enough to start drifting on copy. One home means a wording or styling
 * change lands on both intakes at once.
 *
 * BRANCH_INFO and displayLocation come via lib/regular-utils, which re-exports
 * summer's. Both modals resolve to the same values today; should regular ever
 * fork them, this module follows regular and summer passes its own in.
 */

export function GroupHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-2 pt-1">
      <div className="shrink-0 mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground">{subtitle}</div>
      </div>
    </div>
  );
}

export function SectionList({
  title, count, tone, children,
}: {
  title: string;
  count: number;
  tone: "success" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5 px-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{title}</span>
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
          tone === "success"
            ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
            : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        )}>{count}</span>
      </div>
      <div className={cn(
        "rounded-lg border divide-y overflow-hidden",
        tone === "success"
          ? "border-green-200 dark:border-green-900 divide-green-100 dark:divide-green-900/50"
          : "border-amber-200 dark:border-amber-900 divide-amber-100 dark:divide-amber-900/50"
      )}>
        {children}
      </div>
    </div>
  );
}

export function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-muted-foreground italic px-1">{children}</div>;
}

export function AppChip({ a }: { a: AutoMatchAppSummary | StudentLinkAppSummary }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className="truncate text-sm text-foreground">{a.student_name}</span>
      {a.reference_code && (
        <span className="shrink-0 text-[10px] font-mono text-muted-foreground">{a.reference_code}</span>
      )}
      {a.preferred_location && (
        <span className="shrink-0 text-[10px] text-muted-foreground">{displayLocation(a.preferred_location)}</span>
      )}
      {a.grade && <span className="shrink-0 text-[10px] text-muted-foreground">{a.grade}</span>}
    </span>
  );
}

export function StudentChip({ s }: { s: StudentSuggestionCandidate }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className="truncate text-sm text-foreground">{s.student_name}</span>
      {s.home_location && s.school_student_id && (
        <span className="shrink-0 text-[10px] font-mono text-muted-foreground">
          {s.home_location}-{s.school_student_id}
        </span>
      )}
      {s.grade && (
        <span className="shrink-0 text-[10px] text-muted-foreground"><GradeLabel grade={s.grade} /></span>
      )}
    </span>
  );
}

export function StudentMatchRow({ entry }: { entry: StudentLinkMatch }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm">
      <div className="flex-1 min-w-0"><AppChip a={entry.application} /></div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0"><StudentChip s={entry.student} /></div>
    </div>
  );
}

export function StudentSkipRow({
  entry, overriddenStudentId, onOverride,
}: {
  entry: StudentLinkSkipEntry;
  overriddenStudentId: number | null;
  onOverride: (applicationId: number, studentId: number) => void;
}) {
  if (overriddenStudentId !== null) {
    const picked = entry.candidates.find((s) => s.id === overriddenStudentId);
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm bg-green-50/50 dark:bg-green-900/10">
        <div className="flex-1 min-w-0"><AppChip a={entry.application} /></div>
        <ArrowRight className="h-3.5 w-3.5 text-green-600 shrink-0" />
        <div className="flex-1 min-w-0">{picked && <StudentChip s={picked} />}</div>
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
      </div>
    );
  }
  return (
    <div className="px-3 py-2 space-y-2">
      <div className="min-w-0 space-y-0.5">
        <AppChip a={entry.application} />
        <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>
            {entry.candidates.length} candidate{entry.candidates.length === 1 ? "" : "s"}, review before linking
          </span>
        </div>
      </div>
      <div className="pl-4 space-y-1">
        {entry.candidates.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <div className="flex-1 min-w-0 space-y-0.5">
              <StudentChip s={s} />
              <div className="text-[10px] text-muted-foreground">{s.match_reason}</div>
            </div>
            <LinkThisButton onClick={() => onOverride(entry.application.id, s.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- P6 prospect rows ----------

/**
 * Why a prospect was held back for review. A Record rather than a ternary
 * chain so adding a reason to AutoMatchSkipReason fails to compile until it
 * has a label here, instead of silently falling through to the last arm.
 */
const SKIP_REASON_LABELS: Record<AutoMatchSkipReason, string> = {
  multiple_apps_share_phone: "Multiple applications share this phone",
  multiple_prospects_share_phone: "Multiple prospects share this phone",
  grade_mismatch: "Phone matches, but the grade does not. Likely a sibling",
  name_similarity: "Similar name, no matching phone",
};

export function ProspectChip({ p }: { p: AutoMatchProspectSummary }) {
  const branch = BRANCH_INFO[p.source_branch];
  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <span className={cn(
        "shrink-0 text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded",
        branch?.badge || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
      )}>{p.source_branch}</span>
      <span className="truncate text-sm text-foreground">{p.student_name}</span>
      {p.grade && (
        <span className="shrink-0 text-[10px] text-muted-foreground"><GradeLabel grade={p.grade} /></span>
      )}
    </span>
  );
}

export function ProspectMatchRow({ entry }: { entry: AutoMatchEntry }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm">
      <div className="flex-1 min-w-0"><ProspectChip p={entry.prospect} /></div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0"><AppChip a={entry.application} /></div>
    </div>
  );
}

export function ProspectSkipRow({
  entry, overriddenAppId, onOverride,
}: {
  entry: AutoMatchSkipEntry;
  overriddenAppId: number | null;
  onOverride: (prospectId: number, appId: number) => void;
}) {
  const phoneList = [entry.prospect.phone_1, entry.prospect.phone_2].filter(Boolean).join(" / ");
  const reasonLabel = SKIP_REASON_LABELS[entry.reason];
  const showPhone = entry.reason !== "name_similarity" && Boolean(phoneList);

  if (overriddenAppId !== null) {
    const picked = entry.conflicting_apps.find((a) => a.id === overriddenAppId);
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm bg-green-50/50 dark:bg-green-900/10">
        <div className="flex-1 min-w-0"><ProspectChip p={entry.prospect} /></div>
        <ArrowRight className="h-3.5 w-3.5 text-green-600 shrink-0" />
        <div className="flex-1 min-w-0">{picked && <AppChip a={picked} />}</div>
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
      </div>
    );
  }
  return (
    <div className="px-3 py-2 space-y-2">
      <div className="min-w-0 space-y-0.5">
        <ProspectChip p={entry.prospect} />
        <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{reasonLabel}</span>
          {showPhone && <span className="text-muted-foreground font-mono">· {phoneList}</span>}
        </div>
      </div>
      <div className="pl-4 space-y-1">
        {entry.conflicting_apps.map((a) => (
          <div key={a.id} className="flex items-center gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <AppChip a={a} />
              {typeof a.similarity === "number" && (
                <span className="shrink-0 text-[10px] text-muted-foreground">{a.similarity}% name</span>
              )}
            </div>
            <LinkThisButton onClick={() => onOverride(entry.prospect.id, a.id)} />
          </div>
        ))}
        {entry.reason === "multiple_prospects_share_phone" && entry.conflicting_prospects.length > 0 && (
          <div className="text-[11px] text-muted-foreground pt-0.5">
            Competes with: {entry.conflicting_prospects.map((p) => p.student_name).join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

export function LinkThisButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
    >
      Link this
    </button>
  );
}
