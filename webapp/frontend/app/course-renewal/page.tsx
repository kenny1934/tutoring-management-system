"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { useDebouncedValue, usePageTitle } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { regularAPI } from "@/lib/api";
import { CalendarCheck, Check, Loader2, Search } from "lucide-react";
import { RecordContactModal } from "@/components/parent-contacts/RecordContactModal";
import { RENEWAL_CONTACT_TYPE } from "@/components/parent-contacts/contact-utils";
import {
  ChaseListBody,
  ChipRail,
  FilterChip,
  NotReturningDialog,
  STATE_META,
  UndoNotReturningDialog,
} from "@/components/admin/RegularRetentionSections";
import { SeptemberClasses } from "@/components/regular/SeptemberClasses";
import {
  CHASE_STATES,
  EMPTY_CHASE_FILTERS,
  countChaseStates,
  filterChaseRows,
  formatChaseSort,
  hasPhone,
  parseChaseSort,
  sortChaseRows,
  type ChaseFilters,
  type ChaseSort,
  type ChaseSortKey,
} from "@/lib/retention-utils";
import { currentQuery, useQuerySync } from "@/lib/url-filters";
import type { RegularRetentionChaseRow, RetentionState } from "@/types";

const selectClass =
  "px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground";

/** How the list is ordered. Whoever has been waiting longest goes first,
 *  because the point of the page is a queue. Same shape the admin board uses,
 *  so a column header sorts the same way on both and a link carries the order
 *  between them. */
const RENEWAL_DEFAULT_SORT: ChaseSort = { key: "days_since_contact", dir: "desc" };

/** The two questions a tutor has about September, which are different
 *  questions about different people. Looking back: which of last year's
 *  students have not come back. Looking forward: who is in my class. */
type RenewalView = "chasing" | "class";

const RENEWAL_LISTS: (RetentionState | "all")[] = [...CHASE_STATES];

const RENEWAL_VIEWS: { key: RenewalView; label: string }[] = [
  { key: "chasing", label: "Chasing" },
  { key: "class", label: "September class" },
];

/** What an empty list means, which is different news in each case. */
const EMPTY_LIST_TEXT: Record<RetentionState | "all", string> = {
  no_response: "Every one of your students has answered. There is nobody to chase.",
  applied: "None of your students has applied yet.",
  enrolled: "None of your students is enrolled for September yet.",
  declined: "None of your students has told us they are leaving.",
  not_churn: "None of your students left before this intake opened.",
  all: "You had no students last year that this intake covers.",
};

/** Worklist wording for the same states the admin board names. A tutor is
 *  looking at their own queue rather than reporting on a cohort, so the first
 *  one is the work rather than the answer we have not had. */
const RENEWAL_STATE_LABEL: Record<RetentionState | "all", string> = {
  no_response: "To chase",
  applied: "Applied",
  enrolled: "Enrolled",
  declined: "Not returning",
  not_churn: "Accounted for",
  all: "Everyone",
};

/** A tutor's own view of who hasn't come back yet.
 *
 *  Deliberately not the admin board: no rates, no branch totals, no comparison
 *  against other tutors. Just their students, what we know, and the three
 *  things they can do about it. */
export default function CourseRenewalPage() {
  usePageTitle("Course Renewal");
  const { isGuest, isReadOnly, user, isImpersonating, effectiveRole, impersonatedTutor } = useAuth();
  const [view, setView] = useState<RenewalView>("chasing");
  const [state, setState] = useState<RetentionState | "all">("no_response");
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState("");
  const [sort, setSort] = useState<ChaseSort>(RENEWAL_DEFAULT_SORT);
  const [contactFor, setContactFor] = useState<RegularRetentionChaseRow | null>(null);
  const [declineFor, setDeclineFor] = useState<RegularRetentionChaseRow | null>(null);
  const [undoFor, setUndoFor] = useState<RegularRetentionChaseRow | null>(null);
  const [restored, setRestored] = useState(false);

  // Whose page this is. Picking a tutor in the sidebar has to reach the data
  // or impersonation only ever tests the layout, so the id travels with the
  // request and the server decides whether the caller may ask. Same shape the
  // sessions and student pages already use.
  const viewedTutorId = useMemo(() => {
    if (isImpersonating && effectiveRole === "Tutor" && impersonatedTutor?.id) {
      return impersonatedTutor.id;
    }
    return null;
  }, [isImpersonating, effectiveRole, impersonatedTutor?.id]);

  // The same reason the admin board keeps its filters in the link: a narrowed
  // list is something you send to somebody. Read after mounting so that the
  // server's HTML and the browser's first paint agree.
  useEffect(() => {
    const params = currentQuery();
    if (params.get("view") === "class") setView("class");
    const listParam = params.get("list");
    if (RENEWAL_LISTS.includes(listParam as RetentionState | "all")) {
      setState(listParam as RetentionState | "all");
    }
    setQ(params.get("q") ?? "");
    setGrade(params.get("grade") ?? "");
    const sortParam = params.get("sort");
    if (sortParam) setSort(parseChaseSort(sortParam));
    setRestored(true);
  }, []);

  // The search box waits for a pause in the typing: every write to the address
  // bar is a navigation, and a name typed out is a dozen of them.
  const settledQuery = useDebouncedValue(q, 300);
  useQuerySync(
    {
      view: view === "chasing" ? null : view,
      list: state === "no_response" ? null : state,
      q: settledQuery.trim() || null,
      grade: grade || null,
      sort:
        formatChaseSort(sort) === formatChaseSort(RENEWAL_DEFAULT_SORT)
          ? null
          : formatChaseSort(sort),
    },
    restored
  );

  // Same reasoning as the admin board: the list changes when this tutor logs
  // something, and that path already refetches. See the comment there.
  const { data, isLoading, error, mutate } = useSWR(
    isGuest ? null : ["my-retention", viewedTutorId],
    () => regularAPI.getMyRetention(null, viewedTutorId),
    { revalidateOnFocus: false }
  );

  // Only fetched once the tab is opened, since most tutors have no classes to
  // show yet and the chasing list is what the page is for in August.
  const {
    data: classData,
    isLoading: classLoading,
    error: classError,
  } = useSWR(
    isGuest || view !== "class" ? null : ["my-class", viewedTutorId],
    () => regularAPI.getMyClass(null, viewedTutorId),
    { revalidateOnFocus: false }
  );

  // A student entering a grade the centre does not teach has nothing to apply
  // for, so they are not waiting to answer and there is nothing to ring them
  // about. The admin board holds them out of its chase list for the same
  // reason, and the two surfaces should not disagree about who is work.
  const chaseable = useMemo(
    () => (data?.students ?? []).filter((s) => s.rung !== "none"),
    [data]
  );
  const noClass = useMemo(
    () => (data?.students ?? []).filter((s) => s.state === "no_response" && s.rung === "none"),
    [data]
  );

  const grades = useMemo(() => {
    const found = new Set<string>();
    for (const s of chaseable) if (s.expected_grade) found.add(s.expected_grade);
    return [...found].sort();
  }, [chaseable]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const filters: ChaseFilters = useMemo(
    () => ({ ...EMPTY_CHASE_FILTERS, q, grade, state }),
    [q, grade, state]
  );

  // The busiest tutor has over a hundred students, so a flat list means
  // scrolling to find anyone. Same filtering, counting and sorting the admin
  // chase list uses, minus the axes a tutor has no use for.
  const rows = useMemo(
    () => sortChaseRows(filterChaseRows(chaseable, filters, today), sort.key, sort.dir),
    [chaseable, filters, today, sort]
  );

  // Clicking a column header the second time turns it round, and staleness
  // opens with the most overdue rather than the least. Same rule as the board.
  const onSort = (k: ChaseSortKey) =>
    setSort((current) =>
      current.key === k
        ? { key: k, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key: k, dir: k === "days_since_contact" ? "desc" : "asc" }
    );

  // The branch column earns its place only where a tutor has students at more
  // than one, which is rare. Their own name never does.
  const showBranch = useMemo(
    () => new Set(chaseable.map((r) => r.branch).filter(Boolean)).size > 1,
    [chaseable]
  );

  const stateCounts = useMemo(
    () => countChaseStates(chaseable, filters, today),
    [chaseable, filters, today]
  );

  const filtered = q.trim() !== "" || grade !== "";

  // Counted over everyone still to chase rather than over what is on screen,
  // because it is a fact about the tutor's queue and not about their filter.
  const withoutPhone = useMemo(
    () => chaseable.filter((s) => s.state === "no_response" && !hasPhone(s)).length,
    [chaseable]
  );

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
                  {view === "chasing"
                    ? "These are the students you taught last year and where each of them has got to."
                    : "These are the classes you are down to teach in September and who has been placed in them."}
                </p>
              </div>
            </div>

            {/* Two tabs rather than two pages. They are different questions
                about different people, but a tutor asks both in the same
                sitting in August, and the sidebar item is seasonal enough
                without splitting it in two. */}
            <div className="flex items-center gap-1 mt-3 -mb-1">
              {RENEWAL_VIEWS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
                    view === key
                      ? "bg-card border-border text-foreground shadow-sm"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          {view === "class" ? (
            <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-6">
              <SeptemberClasses
                data={classData}
                isLoading={classLoading}
                error={classError}
              />
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : error || !data ? (
            <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground px-6 text-center">
              There is no course intake open at the moment.
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-6">
              {/* Counts, no rate: this is a worklist, not a scoreboard. The
                  same six lists the admin board offers, in the same order and
                  the same colours, because a tutor and an admin talking about
                  a student should be looking at the same word. */}
              <div className="mb-3">
                <ChipRail bleed>
                {CHASE_STATES.map((key) => (
                  <FilterChip
                    key={key}
                    active={key === state}
                    count={stateCounts[key]}
                    onClick={() => setState(key)}
                  >
                    {key !== "all" && (
                      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATE_META[key].dot)} />
                    )}
                    {RENEWAL_STATE_LABEL[key]}
                  </FilterChip>
                ))}
                </ChipRail>
              </div>

              {/* Two zones rather than one wrapping row, so the count on the
                  right keeps its place instead of moving to whichever line
                  has room for it. */}
              <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <div className="relative w-full sm:w-auto">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                      type="search"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Name, code or phone"
                      // Same width as the board's search, and for the same
                      // reason: the hint needs 146px and the icon takes 32 of
                      // the field, so w-48 cut it off at "Name, code or phon".
                      className={cn(selectClass, "pl-8 w-full sm:w-56")}
                    />
                  </div>
                  {grades.length > 1 && (
                    <select
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">All grades</option>
                      {grades.map((g) => (
                        <option key={g} value={g}>Entering {g}</option>
                      ))}
                    </select>
                  )}
                  {/* Sorting lives in the column headers, and the cards a
                      phone gets have no headers, so that width gets the same
                      orders as a menu. */}
                  <select
                    value={formatChaseSort(sort)}
                    onChange={(e) => setSort(parseChaseSort(e.target.value))}
                    className={cn(selectClass, "md:hidden")}
                    aria-label="Sort the list"
                  >
                    <option value="days_since_contact:desc">Longest waiting first</option>
                    <option value="student_name:asc">By name</option>
                    <option value="expected_grade:asc">By entering grade</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {rows.length} shown
                  </span>
                  {filtered && (
                    <button
                      type="button"
                      onClick={() => { setQ(""); setGrade(""); }}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {rows.length === 0 && !filtered ? (
                // Worth a sentence of its own rather than an empty table: an
                // empty list here is usually good news, and which good news it
                // is depends on the list you are on.
                <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground gap-2">
                  <Check className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm">{EMPTY_LIST_TEXT[state]}</p>
                </div>
              ) : (
                // The board's own list, so a tutor and an admin reading the
                // same student are reading the same row. No ticking, because
                // logging a contact for a hundred families at once is the
                // office's job, and no Tutor column, because they are it.
                <ChaseListBody
                  rows={rows}
                  today={today}
                  isReadOnly={isReadOnly}
                  sort={sort}
                  onSort={onSort}
                  showBranch={showBranch}
                  showTutor={false}
                  emptyText="Nobody matches what you searched for."
                  onContact={setContactFor}
                  onDecline={setDeclineFor}
                  onUndo={setUndoFor}
                />
              )}

              {/* Nobody can be rung from a row with no number, so the page says
                  how many there are rather than letting them absorb calls. Only
                  on the chasing list, since it is only a problem for the people
                  who still have to be rung. */}
              {state === "no_response" && withoutPhone > 0 && (
                <p className="text-[11px] text-muted-foreground mt-3">
                  {withoutPhone === 1
                    ? "One of your students has no phone number on file. The office can add one to their record."
                    : `${withoutPhone} of your students have no phone number on file. The office can add one to their record.`}
                </p>
              )}

              {/* Held back rather than silently dropped: a list that is quietly
                  shorter than the tutor expects is worse than one that says so. */}
              {state === "no_response" && noClass.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {noClass.length === 1
                    ? "One of your students is entering a grade we do not teach, so there is nothing for them to apply for and they are not on this list."
                    : `${noClass.length} of your students are entering a grade we do not teach, so there is nothing for them to apply for and they are not on this list.`}
                </p>
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
              defaultContactType={RENEWAL_CONTACT_TYPE}
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

          {undoFor && data && (
            <UndoNotReturningDialog
              row={undoFor}
              year={data.intake_year}
              quarter={data.intake_quarter}
              onClose={(undone) => {
                setUndoFor(null);
                if (undone) mutate();
              }}
            />
          )}
        </div>
      </PageTransition>
    </DeskSurface>
  );
}
