"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { CheckCircle2, Link2, Loader2 } from "lucide-react";
import { prospectsAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import {
  SectionList, ProspectMatchRow, ProspectSkipRow,
} from "@/components/admin/LinkSuggestionRows";
import type { AutoMatchResult } from "@/types";

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
                {skipped.length} need review, pick one below.
                {totalOverridden > 0 && <> {totalOverridden} resolved.</>}
              </div>
            )}
          </div>
        </div>

        {matches.length > 0 && (
          <SectionList title={isResult ? "Linked" : "Will link"} count={matches.length} tone="success">
            {matches.map((m) => <ProspectMatchRow key={m.prospect.id} entry={m} />)}
          </SectionList>
        )}

        {skipped.length > 0 && (
          <SectionList title="Needs review, pick one to link" count={skipped.length} tone="warning">
            {skipped.map((s) => (
              <ProspectSkipRow
                key={s.prospect.id}
                entry={s}
                overriddenAppId={overridden[s.prospect.id] ?? null}
                onOverride={handleOverride}
              />
            ))}
          </SectionList>
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

