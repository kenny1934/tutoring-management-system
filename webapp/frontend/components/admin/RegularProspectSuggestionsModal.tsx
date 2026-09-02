"use client";

import useSWR from "swr";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2, Users, Link2 } from "lucide-react";
import { regularAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import type { RegularApplication, RegularProspectSuggestion } from "@/types";

/** Match-type badge copy — strongest signal first. */
const MATCH_LABEL: Record<RegularProspectSuggestion["match_type"], string> = {
  student: "Same student",
  "phone+name": "Phone + name",
  phone: "Phone match",
  name: "Name match",
};

/**
 * Reverse prospect matcher for a single regular application: ranked P6
 * prospects that might be this applicant, strongest signal first (shared
 * student, then phone, then name). Clicking a row links the prospect to the
 * application. The per-application counterpart to RegularLinkSuggestionsModal.
 */
export function RegularProspectSuggestionsModal({
  isOpen,
  onClose,
  applicationId,
  onLinked,
}: {
  isOpen: boolean;
  onClose: () => void;
  applicationId: number | null;
  /** Handed the application as the link left it. Linking a prospect can fill
   *  in the verified origin, so the caller's form has to read that back rather
   *  than assume nothing else moved. */
  onLinked: (application: RegularApplication) => void;
}) {
  const { showToast } = useToast();

  // Opts out of the global keepPreviousData. Linking is one click from this
  // list, so a suggestion left over from the previous application would tie a
  // prospect to the wrong applicant.
  const { data, error, isLoading } = useSWR(
    isOpen && applicationId != null ? ["regular-prospect-suggest", applicationId] : null,
    () => regularAPI.getProspectSuggestions(applicationId!),
    { revalidateOnFocus: false, keepPreviousData: false }
  );

  if (!isOpen) return null;

  const suggestions = data?.suggestions ?? [];

  const handleLink = async (prospectId: number) => {
    if (applicationId == null) return;
    try {
      const updated = await regularAPI.linkProspect(applicationId, prospectId);
      showToast("Prospect linked", "success");
      onLinked(updated);
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Link failed", "error");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Link a P6 prospect" size="lg">
      <div className="space-y-3">
        {isLoading && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            Finding prospect candidates...
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>Failed to load candidates. Please try again.</div>
          </div>
        )}

        {!isLoading && !error && (
          <>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 text-sm text-foreground">
              <Link2 className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                {suggestions.length > 0
                  ? `${suggestions.length} prospect candidate${suggestions.length === 1 ? "" : "s"} for this applicant.`
                  : "No prospect candidates found for this applicant."}
              </div>
            </div>

            {suggestions.length > 0 && (
              <div className="rounded-lg border border-primary/20 divide-y divide-primary/10 overflow-hidden">
                {suggestions.map((s) => (
                  <div key={s.prospect_id} className="flex items-center gap-2 px-3 py-2">
                    <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate text-sm text-foreground">{s.student_name}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{s.source_branch}</span>
                        {s.grade && <span className="shrink-0 text-[10px] text-muted-foreground">{s.grade}</span>}
                        {s.phone_1 && (
                          <span className="shrink-0 text-[10px] font-mono text-muted-foreground">{s.phone_1}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0 rounded-full font-medium",
                            s.match_type === "student"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                              : "bg-primary/10 text-primary"
                          )}
                        >
                          {MATCH_LABEL[s.match_type]}
                          {s.similarity != null ? ` ${s.similarity}%` : ""}
                        </span>
                        {s.already_linked && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400">
                            already linked to another application
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLink(s.prospect_id)}
                      className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
                    >
                      Link this
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
