"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { ArrowRight, CheckCircle2, AlertTriangle, Link2, Loader2 } from "lucide-react";
import { BRANCH_INFO, displayLocation } from "@/lib/summer-utils";
import { prospectsAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import type {
  AutoMatchResult,
  AutoMatchEntry,
  AutoMatchSkipEntry,
  AutoMatchProspectSummary,
  AutoMatchAppSummary,
} from "@/types";

type Mode = "preview" | "result";

export function AutoMatchPreviewModal({
  isOpen,
  onClose,
  preview,
  year,
  onDone,
}: {
  isOpen: boolean;
  onClose: () => void;
  preview: AutoMatchResult | null;
  year: number;
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const [executing, setExecuting] = useState(false);
  const [mode, setMode] = useState<Mode>("preview");
  const [current, setCurrent] = useState<AutoMatchResult | null>(null);
  // Track prospect ids resolved via manual override so the skipped row can
  // flip into a "linked" confirmation inline.
  const [overridden, setOverridden] = useState<Record<number, number>>({});
  // Avoid refetching the parent list per override — defer the refresh until
  // the modal closes, and only if the user actually changed something.
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (isOpen && preview) {
      setCurrent(preview);
      setMode("preview");
      setOverridden({});
      setDirty(false);
    }
  }, [isOpen, preview]);

  if (!isOpen || !current) return null;

  const handleClose = () => {
    if (dirty) onDone();
    onClose();
  };

  const { matches, skipped, total_unlinked } = current;
  const totalOverridden = Object.keys(overridden).length;

  const handleExecute = async () => {
    setExecuting(true);
    try {
      const result = await prospectsAPI.autoMatch(year, { dryRun: false });
      setCurrent(result);
      setMode("result");
      setOverridden({});
      setDirty(true);
      showToast(`Linked ${result.matches.length} prospects`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Auto-match failed", "error");
    } finally {
      setExecuting(false);
    }
  };

  const handleOverride = async (prospectId: number, appId: number) => {
    try {
      await prospectsAPI.adminUpdate(prospectId, { summer_application_id: appId });
      setOverridden((prev) => ({ ...prev, [prospectId]: appId }));
      setDirty(true);
      showToast("Linked manually", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Manual link failed", "error");
    }
  };

  const isResult = mode === "result";
  const summaryText = isResult
    ? `Linked ${matches.length} of ${total_unlinked} unlinked prospects.`
    : `Will link ${matches.length} of ${total_unlinked} unlinked prospects.`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Auto-match prospects to applications"
      size="xl"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            {isResult ? "Close" : "Cancel"}
          </button>
          {!isResult && (
            <button
              type="button"
              onClick={handleExecute}
              disabled={executing || matches.length === 0}
              className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {executing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {matches.length > 0 ? `Link ${matches.length} prospect${matches.length === 1 ? "" : "s"}` : "Nothing to link"}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div className={cn(
          "flex items-start gap-2 p-3 rounded-lg text-sm",
          isResult ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300"
                   : "bg-primary/5 text-foreground"
        )}>
          {isResult
            ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            : <Link2 className="h-4 w-4 shrink-0 mt-0.5" />}
          <div className="flex-1">
            <div>{summaryText}</div>
            {skipped.length > 0 && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {skipped.length} need review — pick one below.
                {totalOverridden > 0 && <> {totalOverridden} resolved.</>}
              </div>
            )}
          </div>
        </div>

        {matches.length > 0 && (
          <Section
            title={isResult ? "Linked" : "Will link"}
            count={matches.length}
            tone="success"
          >
            <div className="rounded-lg border border-green-200 dark:border-green-900 divide-y divide-green-100 dark:divide-green-900/50">
              {matches.map((m) => <MatchRow key={m.prospect.id} entry={m} />)}
            </div>
          </Section>
        )}

        {skipped.length > 0 && (
          <Section
            title="Needs review — pick one to link"
            count={skipped.length}
            tone="warning"
          >
            <div className="rounded-lg border border-amber-200 dark:border-amber-900 divide-y divide-amber-100 dark:divide-amber-900/50">
              {skipped.map((s) => (
                <SkipRow
                  key={s.prospect.id}
                  entry={s}
                  overriddenAppId={overridden[s.prospect.id] ?? null}
                  onOverride={handleOverride}
                />
              ))}
            </div>
          </Section>
        )}

        {matches.length === 0 && skipped.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-6">
            {total_unlinked === 0
              ? "No unlinked prospects for this year."
              : "No phone or name matches found among unlinked prospects."}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Section({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone: "success" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5 px-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
          {title}
        </span>
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
          tone === "success"
            ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
            : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        )}>
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function ProspectChip({ p }: { p: AutoMatchProspectSummary }) {
  const branch = BRANCH_INFO[p.source_branch];
  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <span className={cn(
        "shrink-0 text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded",
        branch?.badge || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
      )}>
        {p.source_branch}
      </span>
      <span className="truncate text-sm text-foreground">{p.student_name}</span>
      {p.grade && <span className="shrink-0 text-[10px] text-muted-foreground">{p.grade}</span>}
    </span>
  );
}

function AppChip({ a }: { a: AutoMatchAppSummary }) {
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

function MatchRow({ entry }: { entry: AutoMatchEntry }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm">
      <div className="flex-1 min-w-0"><ProspectChip p={entry.prospect} /></div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0"><AppChip a={entry.application} /></div>
    </div>
  );
}

function SkipRow({
  entry,
  overriddenAppId,
  onOverride,
}: {
  entry: AutoMatchSkipEntry;
  overriddenAppId: number | null;
  onOverride: (prospectId: number, appId: number) => void;
}) {
  const phoneList = [entry.prospect.phone_1, entry.prospect.phone_2].filter(Boolean).join(" / ");
  const reasonLabel =
    entry.reason === "multiple_apps_share_phone" ? "Multiple applications share this phone" :
    entry.reason === "multiple_prospects_share_phone" ? "Multiple prospects share this phone" :
    "Similar name — no matching phone";

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

  const showPhone = entry.reason !== "name_similarity" && Boolean(phoneList);

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
            <button
              type="button"
              onClick={() => onOverride(entry.prospect.id, a.id)}
              className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
            >
              Link this
            </button>
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
