"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import {
  ArrowRight, CheckCircle2, AlertTriangle, Link2, Loader2, Users, GraduationCap,
} from "lucide-react";
import { BRANCH_INFO, displayLocation } from "@/lib/summer-utils";
import { prospectsAPI, summerAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import type {
  AutoMatchResult,
  AutoMatchEntry,
  AutoMatchSkipEntry,
  AutoMatchProspectSummary,
  AutoMatchAppSummary,
  StudentLinkSuggestResult,
  StudentLinkMatch,
  StudentLinkSkipEntry,
  StudentLinkAppSummary,
  StudentSuggestionCandidate,
} from "@/types";

type Mode = "preview" | "result";

export function ApplicationLinkSuggestionsModal({
  isOpen,
  onClose,
  year,
  configId,
  onDone,
}: {
  isOpen: boolean;
  onClose: () => void;
  year: number | null;
  configId: number | null;
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const [executing, setExecuting] = useState(false);
  const [mode, setMode] = useState<Mode>("preview");
  const [primary, setPrimary] = useState<AutoMatchResult | null>(null);
  const [secondary, setSecondary] = useState<StudentLinkSuggestResult | null>(null);
  const [overriddenPrimary, setOverriddenPrimary] = useState<Record<number, number>>({});
  const [overriddenSecondary, setOverriddenSecondary] = useState<Record<number, number>>({});
  const [dirty, setDirty] = useState(false);

  const canFetch = isOpen && year != null && configId != null;

  const { data: primaryPreview, error: primaryError, isLoading: primaryLoading } = useSWR(
    canFetch ? ["link-suggest-primary", year] : null,
    () => prospectsAPI.autoMatch(year!, { dryRun: true }),
    { revalidateOnFocus: false },
  );
  const { data: secondaryPreview, error: secondaryError, isLoading: secondaryLoading } = useSWR(
    canFetch ? ["link-suggest-secondary", configId] : null,
    () => summerAPI.suggestStudentLinks(configId!, { dryRun: true }),
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    if (isOpen && primaryPreview) setPrimary(primaryPreview);
  }, [isOpen, primaryPreview]);
  useEffect(() => {
    if (isOpen && secondaryPreview) setSecondary(secondaryPreview);
  }, [isOpen, secondaryPreview]);
  useEffect(() => {
    if (isOpen) {
      setMode("preview");
      setOverriddenPrimary({});
      setOverriddenSecondary({});
      setDirty(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (dirty) onDone();
    onClose();
  };

  const handleExecute = async () => {
    if (year == null || configId == null) return;
    setExecuting(true);
    try {
      const [primaryResult, secondaryResult] = await Promise.all([
        prospectsAPI.autoMatch(year, { dryRun: false }),
        summerAPI.suggestStudentLinks(configId, { dryRun: false }),
      ]);
      setPrimary(primaryResult);
      setSecondary(secondaryResult);
      setMode("result");
      setOverriddenPrimary({});
      setOverriddenSecondary({});
      setDirty(true);
      const total = primaryResult.matches.length + secondaryResult.matches.length;
      showToast(`Linked ${total} records`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Link execution failed", "error");
    } finally {
      setExecuting(false);
    }
  };

  const handleOverridePrimary = async (prospectId: number, appId: number) => {
    try {
      await prospectsAPI.adminUpdate(prospectId, { summer_application_id: appId });
      setOverriddenPrimary((prev) => ({ ...prev, [prospectId]: appId }));
      setDirty(true);
      showToast("Linked", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Link failed", "error");
    }
  };

  const handleOverrideSecondary = async (applicationId: number, studentId: number) => {
    try {
      await summerAPI.updateApplication(applicationId, { existing_student_id: studentId });
      setOverriddenSecondary((prev) => ({ ...prev, [applicationId]: studentId }));
      setDirty(true);
      showToast("Linked", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Link failed", "error");
    }
  };

  const isResult = mode === "result";
  const loading = primaryLoading || secondaryLoading || !primary || !secondary;
  const error = primaryError || secondaryError;
  const primaryMatches = primary?.matches ?? [];
  const primarySkipped = primary?.skipped ?? [];
  const secondaryMatches = secondary?.matches ?? [];
  const secondarySkipped = secondary?.skipped ?? [];
  const totalMatches = primaryMatches.length + secondaryMatches.length;
  const totalSkipped = primarySkipped.length + secondarySkipped.length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Link suggestions"
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
              disabled={executing || loading || totalMatches === 0}
              className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {executing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {totalMatches > 0 ? `Link ${totalMatches} record${totalMatches === 1 ? "" : "s"}` : "Nothing to link"}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            Fetching link suggestions…
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>Failed to load suggestions. Please try again.</div>
          </div>
        )}

        {!loading && !error && (
          <div className={cn(
            "flex items-start gap-2 p-3 rounded-lg text-sm",
            isResult ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300"
                     : "bg-primary/5 text-foreground"
          )}>
            {isResult
              ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              : <Link2 className="h-4 w-4 shrink-0 mt-0.5" />}
            <div className="flex-1">
              <div>
                {isResult
                  ? `Linked ${totalMatches} records across primary prospects and secondary students.`
                  : `${totalMatches} high-confidence 1:1 matches ready to link.`}
              </div>
              {totalSkipped > 0 && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {totalSkipped} ambiguous — resolve manually below.
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && !error && (
          <>
            <GroupHeader
              icon={<GraduationCap className="h-4 w-4" />}
              title="Primary branch prospects"
              subtitle="Matched by phone to P6 prospect records"
            />
            {primaryMatches.length > 0 && (
              <SectionList title={isResult ? "Linked" : "Will link"} count={primaryMatches.length} tone="success">
                {primaryMatches.map((m) => <ProspectMatchRow key={m.prospect.id} entry={m} />)}
              </SectionList>
            )}
            {primarySkipped.length > 0 && (
              <SectionList title="Ambiguous — pick one to link" count={primarySkipped.length} tone="warning">
                {primarySkipped.map((s) => (
                  <ProspectSkipRow
                    key={s.prospect.id}
                    entry={s}
                    overriddenAppId={overriddenPrimary[s.prospect.id] ?? null}
                    onOverride={handleOverridePrimary}
                  />
                ))}
              </SectionList>
            )}
            {primaryMatches.length === 0 && primarySkipped.length === 0 && (
              <EmptyLine>No primary-branch matches.</EmptyLine>
            )}

            <GroupHeader
              icon={<Users className="h-4 w-4" />}
              title="Secondary branch students"
              subtitle="Apps claiming MSA or MSB, matched to existing student records by name and phone"
            />
            {secondaryMatches.length > 0 && (
              <SectionList title={isResult ? "Linked" : "Will link"} count={secondaryMatches.length} tone="success">
                {secondaryMatches.map((m) => <StudentMatchRow key={m.application.id} entry={m} />)}
              </SectionList>
            )}
            {secondarySkipped.length > 0 && (
              <SectionList title="Needs review — pick one to link" count={secondarySkipped.length} tone="warning">
                {secondarySkipped.map((s) => (
                  <StudentSkipRow
                    key={s.application.id}
                    entry={s}
                    overriddenStudentId={overriddenSecondary[s.application.id] ?? null}
                    onOverride={handleOverrideSecondary}
                  />
                ))}
              </SectionList>
            )}
            {secondaryMatches.length === 0 && secondarySkipped.length === 0 && (
              <EmptyLine>No secondary-branch candidates.</EmptyLine>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// ---------- Shared presentational helpers ----------

function GroupHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
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

function SectionList({
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

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-muted-foreground italic px-1">{children}</div>;
}

function ProspectChip({ p }: { p: AutoMatchProspectSummary }) {
  const branch = BRANCH_INFO[p.source_branch];
  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <span className={cn(
        "shrink-0 text-[10px] font-semibold font-mono px-1.5 py-0.5 rounded",
        branch?.badge || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
      )}>{p.source_branch}</span>
      <span className="truncate text-sm text-foreground">{p.student_name}</span>
      {p.grade && <span className="shrink-0 text-[10px] text-muted-foreground">{p.grade}</span>}
    </span>
  );
}

function AppChip({ a }: { a: AutoMatchAppSummary | StudentLinkAppSummary }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className="truncate text-sm text-foreground">{a.student_name}</span>
      {a.reference_code && <span className="shrink-0 text-[10px] font-mono text-muted-foreground">{a.reference_code}</span>}
      {a.preferred_location && <span className="shrink-0 text-[10px] text-muted-foreground">{displayLocation(a.preferred_location)}</span>}
      {a.grade && <span className="shrink-0 text-[10px] text-muted-foreground">{a.grade}</span>}
    </span>
  );
}

function StudentChip({ s }: { s: StudentSuggestionCandidate }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className="truncate text-sm text-foreground">{s.student_name}</span>
      {s.home_location && s.school_student_id && (
        <span className="shrink-0 text-[10px] font-mono text-muted-foreground">
          {s.home_location}-{s.school_student_id}
        </span>
      )}
      {s.grade && <span className="shrink-0 text-[10px] text-muted-foreground">{s.grade}</span>}
    </span>
  );
}

// ---------- Primary (prospect) rows ----------

function ProspectMatchRow({ entry }: { entry: AutoMatchEntry }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm">
      <div className="flex-1 min-w-0"><ProspectChip p={entry.prospect} /></div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0"><AppChip a={entry.application} /></div>
    </div>
  );
}

function ProspectSkipRow({
  entry, overriddenAppId, onOverride,
}: {
  entry: AutoMatchSkipEntry;
  overriddenAppId: number | null;
  onOverride: (prospectId: number, appId: number) => void;
}) {
  const phoneList = [entry.prospect.phone_1, entry.prospect.phone_2].filter(Boolean).join(" / ");
  const reasonLabel = entry.reason === "multiple_apps_share_phone"
    ? "Multiple applications share this phone"
    : "Multiple prospects share this phone";

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
          {phoneList && <span className="text-muted-foreground font-mono">· {phoneList}</span>}
        </div>
      </div>
      <div className="pl-4 space-y-1">
        {entry.conflicting_apps.map((a) => (
          <div key={a.id} className="flex items-center gap-2">
            <div className="flex-1 min-w-0"><AppChip a={a} /></div>
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

// ---------- Secondary (student) rows ----------

function StudentMatchRow({ entry }: { entry: StudentLinkMatch }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm">
      <div className="flex-1 min-w-0"><AppChip a={entry.application} /></div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0"><StudentChip s={entry.student} /></div>
    </div>
  );
}

function StudentSkipRow({
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
          <span>{entry.candidates.length} candidate{entry.candidates.length === 1 ? "" : "s"} — review before linking</span>
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

function LinkThisButton({ onClick }: { onClick: () => void }) {
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
