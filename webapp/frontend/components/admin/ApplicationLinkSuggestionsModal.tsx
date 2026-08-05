"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, AlertTriangle, Link2, Loader2, Users, GraduationCap,
} from "lucide-react";
import { prospectsAPI, summerAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import type { AutoMatchResult, StudentLinkSuggestResult } from "@/types";
import {
  GroupHeader, SectionList, EmptyLine,
  StudentMatchRow, StudentSkipRow, ProspectMatchRow, ProspectSkipRow,
} from "@/components/admin/LinkSuggestionRows";

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
                  {totalSkipped} need review — pick one below.
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
              subtitle="Matched by phone to P6 prospect records; similar names surfaced for review"
            />
            {primaryMatches.length > 0 && (
              <SectionList title={isResult ? "Linked" : "Will link"} count={primaryMatches.length} tone="success">
                {primaryMatches.map((m) => <ProspectMatchRow key={m.prospect.id} entry={m} />)}
              </SectionList>
            )}
            {primarySkipped.length > 0 && (
              <SectionList title="Needs review — pick one to link" count={primarySkipped.length} tone="warning">
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
