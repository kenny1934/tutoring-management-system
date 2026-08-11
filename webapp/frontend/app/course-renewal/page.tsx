"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { regularAPI } from "@/lib/api";
import { CalendarCheck, Check, Loader2, MessageSquarePlus, UserMinus } from "lucide-react";
import { CopyableCell, StudentCodeBadge } from "@/components/summer/prospect-badges";
import { RecordContactModal } from "@/components/parent-contacts/RecordContactModal";
import {
  NotReturningDialog,
  STATE_META,
} from "@/components/admin/RegularRetentionSections";
import type { RegularRetentionChaseRow } from "@/types";

/** A tutor's own view of who hasn't come back yet.
 *
 *  Deliberately not the admin board: no rates, no branch totals, no comparison
 *  against other tutors. Just their students, what we know, and the two things
 *  they can do about it. */
export default function CourseRenewalPage() {
  usePageTitle("Course Renewal");
  const { isGuest, isReadOnly, user } = useAuth();
  const [showDone, setShowDone] = useState(false);
  const [contactFor, setContactFor] = useState<RegularRetentionChaseRow | null>(null);
  const [declineFor, setDeclineFor] = useState<RegularRetentionChaseRow | null>(null);

  const { data, isLoading, error, mutate } = useSWR(
    isGuest ? null : "my-retention",
    () => regularAPI.getMyRetention()
  );

  const outstanding = useMemo(
    () => (data?.students ?? []).filter((s) => s.state === "no_response"),
    [data]
  );
  const settled = useMemo(
    () => (data?.students ?? []).filter((s) => s.state !== "no_response"),
    [data]
  );
  const rows = showDone ? settled : outstanding;

  if (isGuest) {
    return (
      <DeskSurface fullHeight>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          You do not have access to this page.
        </div>
      </DeskSurface>
    );
  }

  return (
    <DeskSurface fullHeight>
      <PageTransition className="flex flex-col h-full p-4 sm:p-6">
        <div className="flex flex-col h-full bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm paper-texture overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-9 h-9 shrink-0 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                <CalendarCheck className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-base sm:text-lg font-semibold text-foreground">Course Renewal</h1>
                <p className="hidden sm:block text-xs text-muted-foreground">
                  Your students who have not yet applied for September.
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          {isLoading ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : error || !data ? (
            <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground px-6 text-center">
              There is no course intake open at the moment.
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-6">
              {/* Two counts, no rate: this is a worklist, not a scoreboard. */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowDone(false)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
                    !showDone
                      ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  To chase ({outstanding.length})
                </button>
                <button
                  type="button"
                  onClick={() => setShowDone(true)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
                    showDone
                      ? "bg-card border-border text-foreground shadow-sm"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  Settled ({settled.length})
                </button>
              </div>

              {rows.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground gap-2">
                  <Check className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm">
                    {showDone
                      ? "Nothing settled yet."
                      : "Every one of your students has answered. Nothing to chase."}
                  </p>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-auto space-y-2">
                  {rows.map((s) => (
                    <div
                      key={s.student_id}
                      className="rounded-lg border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 bg-white/40 dark:bg-white/[0.02] px-3 py-2.5"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-foreground">{s.student_name}</span>
                            {s.student_code && <StudentCodeBadge code={s.student_code} />}
                            {s.expected_grade && (
                              <span className="text-[11px] text-muted-foreground">
                                entering {s.expected_grade}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            {s.phone && (
                              <span className="tabular-nums text-foreground">
                                <CopyableCell text={s.phone} />
                              </span>
                            )}
                            <span>
                              {s.days_since_contact == null
                                ? "never spoken to"
                                : `last spoken ${s.days_since_contact}d ago`}
                            </span>
                            {s.follow_up_needed && s.follow_up_date && (
                              <span className="text-sky-700 dark:text-sky-400">
                                follow up {s.follow_up_date}
                              </span>
                            )}
                          </div>
                          {s.state !== "no_response" && (
                            <div className={cn("text-xs mt-1", STATE_META[s.state].tone)}>
                              {STATE_META[s.state].label}
                              {s.decline_reason_category && ` · ${s.decline_reason_category}`}
                            </div>
                          )}
                        </div>

                        {!isReadOnly && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setContactFor(s)}
                              title="Log a contact with this family"
                              className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary"
                            >
                              <MessageSquarePlus className="h-4 w-4" />
                            </button>
                            {s.state !== "declined" && (
                              <button
                                type="button"
                                onClick={() => setDeclineFor(s)}
                                title="Mark this family as not returning"
                                className="p-1.5 rounded hover:bg-rose-500/10 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
                              >
                                <UserMinus className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {contactFor && (
            <RecordContactModal
              isOpen
              onClose={(saved) => {
                setContactFor(null);
                if (saved) mutate();
              }}
              editingContact={null}
              preselectedStudentId={contactFor.student_id}
            />
          )}

          {declineFor && data && (
            <NotReturningDialog
              row={declineFor}
              year={data.intake_year}
              quarter={data.intake_quarter}
              updatedBy={user?.email ?? ""}
              onClose={(saved) => {
                setDeclineFor(null);
                if (saved) mutate();
              }}
            />
          )}
        </div>
      </PageTransition>
    </DeskSurface>
  );
}
