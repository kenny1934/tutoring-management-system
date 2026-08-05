"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import {
  ArrowRight, CheckCircle2, AlertTriangle, Link2, Loader2, Users, GraduationCap,
} from "lucide-react";
import { displayLocation, BRANCH_INFO } from "@/lib/regular-utils";
import { prospectsAPI, regularAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { GradeLabel } from "@/components/ui/grade-label";
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

/**
 * Bulk link review for regular applications, in two halves that mirror the
 * summer ApplicationLinkSuggestionsModal: P6 prospects matched to applications
 * (the primary-to-secondary journey the conversion report reads), and
 * applications matched to existing MSA/MSB student records.
 *
 * The halves are independent, not alternatives. An application normally ends
 * up with both links: a student record so it can publish an enrollment, and a
 * prospect so the funnel knows where the applicant came from.
 */
export function RegularLinkSuggestionsModal({
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
  const [result, setResult] = useState<StudentLinkSuggestResult | null>(null);
  const [prospects, setProspects] = useState<AutoMatchResult | null>(null);
  const [overridden, setOverridden] = useState<Record<number, number>>({});
  const [overriddenProspect, setOverriddenProspect] = useState<Record<number, number>>({});
  const [dirty, setDirty] = useState(false);

  const canFetch = isOpen && configId != null && year != null;

  const { data: preview, error, isLoading } = useSWR(
    canFetch ? ["regular-link-suggest", configId] : null,
    () => regularAPI.suggestStudentLinks(configId!, true),
    { revalidateOnFocus: false }
  );
  const { data: prospectPreview, error: prospectError, isLoading: prospectLoading } = useSWR(
    canFetch ? ["regular-link-suggest-prospects", year] : null,
    () => prospectsAPI.regularAutoMatch(year!, { dryRun: true }),
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (isOpen && preview) setResult(preview);
  }, [isOpen, preview]);

  useEffect(() => {
    if (isOpen && prospectPreview) setProspects(prospectPreview);
  }, [isOpen, prospectPreview]);

  useEffect(() => {
    if (isOpen) {
      setMode("preview");
      setOverridden({});
      setOverriddenProspect({});
      setDirty(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (dirty) onDone();
    onClose();
  };

  const handleExecute = async () => {
    if (configId == null || year == null) return;
    setExecuting(true);
    try {
      const [appliedProspects, applied] = await Promise.all([
        prospectsAPI.regularAutoMatch(year, { dryRun: false }),
        regularAPI.suggestStudentLinks(configId, false),
      ]);
      setProspects(appliedProspects);
      setResult(applied);
      setMode("result");
      setOverridden({});
      setOverriddenProspect({});
      setDirty(true);
      const total = appliedProspects.matches.length + applied.matches.length;
      showToast(`Linked ${total} record${total === 1 ? "" : "s"}`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Linking failed", "error");
    } finally {
      setExecuting(false);
    }
  };

  const handleOverride = async (applicationId: number, studentId: number) => {
    try {
      await regularAPI.updateApplication(applicationId, { existing_student_id: studentId });
      setOverridden((prev) => ({ ...prev, [applicationId]: studentId }));
      setDirty(true);
      showToast("Linked", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Link failed", "error");
    }
  };

  const handleOverrideProspect = async (prospectId: number, applicationId: number) => {
    try {
      await prospectsAPI.linkCourseApplication(prospectId, "regular", applicationId);
      setOverriddenProspect((prev) => ({ ...prev, [prospectId]: applicationId }));
      setDirty(true);
      showToast("Linked", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Link failed", "error");
    }
  };

  const isResult = mode === "result";
  const loadError = error || prospectError;
  const loading = isLoading || prospectLoading || !result || !prospects;
  const matches = result?.matches ?? [];
  const skipped = result?.skipped ?? [];
  const totalUnlinked = result?.total_unlinked ?? 0;
  const prospectMatches = prospects?.matches ?? [];
  const prospectSkipped = prospects?.skipped ?? [];
  const totalMatches = matches.length + prospectMatches.length;
  const totalSkipped = skipped.length + prospectSkipped.length;

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
              {totalMatches > 0
                ? `Link ${totalMatches} record${totalMatches === 1 ? "" : "s"}`
                : "Nothing to link"}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {loading && !loadError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            Fetching link suggestions...
          </div>
        )}
        {loadError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>Failed to load suggestions. Please try again.</div>
          </div>
        )}

        {!loading && !loadError && (
          <>
            <div className={cn(
              "flex items-start gap-2 p-3 rounded-lg text-sm",
              isResult
                ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300"
                : "bg-primary/5 text-foreground"
            )}>
              {isResult
                ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                : <Link2 className="h-4 w-4 shrink-0 mt-0.5" />}
              <div className="flex-1">
                <div>
                  {isResult
                    ? `Linked ${totalMatches} record${totalMatches === 1 ? "" : "s"} across P6 prospects and existing students.`
                    : `${totalMatches} high-confidence 1:1 match${totalMatches === 1 ? "" : "es"} ready to link.`}
                </div>
                {totalSkipped > 0 && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {totalSkipped} need review, pick one below.
                  </div>
                )}
              </div>
            </div>

            <GroupHeader
              icon={<GraduationCap className="h-4 w-4" />}
              title="P6 prospects"
              subtitle="Matched by the student they enrolled as in summer, then by phone; similar names surfaced for review"
            />
            {prospectMatches.length > 0 && (
              <SectionList title={isResult ? "Linked" : "Will link"} count={prospectMatches.length} tone="success">
                {prospectMatches.map((m) => <ProspectMatchRow key={m.prospect.id} entry={m} />)}
              </SectionList>
            )}
            {prospectSkipped.length > 0 && (
              <SectionList title="Needs review, pick one to link" count={prospectSkipped.length} tone="warning">
                {prospectSkipped.map((s) => (
                  <ProspectSkipRow
                    key={s.prospect.id}
                    entry={s}
                    overriddenAppId={overriddenProspect[s.prospect.id] ?? null}
                    onOverride={handleOverrideProspect}
                  />
                ))}
              </SectionList>
            )}
            {prospectMatches.length === 0 && prospectSkipped.length === 0 && (
              <EmptyLine>No P6 prospect matches.</EmptyLine>
            )}

            <GroupHeader
              icon={<Users className="h-4 w-4" />}
              title="Existing students"
              subtitle="Applications claiming MSA or MSB, matched to student records by name and phone"
            />
            {matches.length > 0 && (
              <SectionList title={isResult ? "Linked" : "Will link"} count={matches.length} tone="success">
                {matches.map((m) => <StudentMatchRow key={m.application.id} entry={m} />)}
              </SectionList>
            )}
            {skipped.length > 0 && (
              <SectionList title="Needs review, pick one to link" count={skipped.length} tone="warning">
                {skipped.map((s) => (
                  <StudentSkipRow
                    key={s.application.id}
                    entry={s}
                    overriddenStudentId={overridden[s.application.id] ?? null}
                    onOverride={handleOverride}
                  />
                ))}
              </SectionList>
            )}
            {matches.length === 0 && skipped.length === 0 && (
              <EmptyLine>
                {totalUnlinked === 0
                  ? "No unlinked applications claim a Secondary Academy branch."
                  : "No candidate student records found. Link these by hand from each application."}
              </EmptyLine>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// ---------- Presentational helpers (mirrors the summer modal) ----------

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

function AppChip({ a }: { a: AutoMatchAppSummary | StudentLinkAppSummary }) {
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

function StudentChip({ s }: { s: StudentSuggestionCandidate }) {
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

function ProspectChip({ p }: { p: AutoMatchProspectSummary }) {
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
  const reasonLabel =
    entry.reason === "multiple_apps_share_phone" ? "Multiple applications share this phone" :
    entry.reason === "multiple_prospects_share_phone" ? "Multiple prospects share this phone" :
    "Similar name, no matching phone";
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
