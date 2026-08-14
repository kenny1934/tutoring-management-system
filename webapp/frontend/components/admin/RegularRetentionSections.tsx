"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Loader2,
  MessageSquarePlus,
  Search,
  SlidersHorizontal,
  Undo2,
  UserMinus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parentCommunicationsAPI, terminationsAPI } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveTutors, useDebouncedValue, useProspectPreview } from "@/lib/hooks";
import { regularStatusLabel } from "@/lib/regular-utils";
import { EnteringGradeBadge } from "@/components/ui/grade-label";
import {
  CATEGORY_CONFIG,
  TERMINATION_REASON_CATEGORIES,
  getCategoryColor,
} from "@/lib/termination-constants";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { CopyableCell, StudentCodeBadge } from "@/components/summer/prospect-badges";
import { ProspectJourneyChip } from "@/components/admin/ProspectJourneyChip";
import { ProspectDetailModal } from "@/components/summer/prospect-detail-modal";
import { RecordContactModal } from "@/components/parent-contacts/RecordContactModal";
import {
  CONTACT_METHODS,
  CONTACT_TYPES,
  RENEWAL_CONTACT_TYPE,
} from "@/components/parent-contacts/contact-utils";
import {
  CHASE_QUERY_KEYS,
  CHASE_STATES,
  CONTACT_FILTERS,
  DEFAULT_CHASE_SORT,
  EMPTY_CHASE_FILTERS,
  chaseFiltersFromQuery,
  chaseFiltersToQuery,
  countChaseContact,
  countChaseStates,
  filterChaseRows,
  formatChaseSort,
  hasPhone,
  isFollowUpDue,
  parseChaseSort,
  shortDate,
  sortChaseRows,
  type ChaseFilters,
  type ChaseSort,
  type ChaseSortKey,
  type ContactFilter,
} from "@/lib/retention-utils";
import { currentQuery, useQuerySync } from "@/lib/url-filters";
import type {
  RegularRetentionChaseRow,
  RegularRetentionResponse,
  RegularRetentionRow,
  RetentionSource,
  RetentionState,
} from "@/types";

// Shared table styling, matching the conversion board's tables.
const wrap = "border border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 rounded-lg overflow-hidden";
const thead = "bg-[#f0e6d8]/50 dark:bg-[#2a2520]";
const theadRow = "border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30";
const th = "px-3 py-2 text-left font-medium text-foreground";
const thNum = "px-3 py-2 text-right font-medium text-foreground";
const tdNum = "px-3 py-2 text-right tabular-nums";
const rowDivide = "divide-y divide-[#e8d4b8]/30 dark:divide-[#6b5a4a]/30";

const selectClass =
  "px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground";

/** Whole-number percent, guarding a zero denominator. */
function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "-";
}

/** Text tone per outcome. Applied and enrolled reuse the conversion board's
 *  indigo/purple so the same stage reads the same colour on both boards;
 *  declined is rose because it is a loss, not a neutral state. */
export const STATE_META: Record<RetentionState, { label: string; tone: string; dot: string }> = {
  enrolled: { label: "Enrolled", tone: "text-purple-600 dark:text-purple-400", dot: "bg-purple-500" },
  applied: { label: "Applied", tone: "text-indigo-600 dark:text-indigo-400", dot: "bg-indigo-500" },
  declined: { label: "Not returning", tone: "text-rose-600 dark:text-rose-400", dot: "bg-rose-500" },
  not_churn: { label: "Accounted for", tone: "text-muted-foreground", dot: "bg-slate-400" },
  no_response: { label: "No response", tone: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
};

/** The two states that were written by hand and can be taken back. */
export function isRecordedAsLeaving(state: RetentionState): boolean {
  return state === "declined" || state === "not_churn";
}

/** The student's own record, opened alongside the list rather than in place of
 *  it: the list is a call queue, and losing your place in it to read one
 *  history is how a caller loses ten minutes. */
export function StudentLink({
  row,
  className,
}: {
  // Anything carrying a student's id and name, so the panels that list
  // students who are not on the chase list can use it too.
  row: { student_id: number; student_name: string };
  className?: string;
}) {
  return (
    <a
      href={`/students/${row.student_id}?tab=profile`}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open ${row.student_name}'s record in a new tab`}
      className={cn("hover:text-primary hover:underline", className)}
    >
      {row.student_name}
    </a>
  );
}

/** A family with no number on file cannot be worked from this list at all, so
 *  it says so rather than showing a dash that reads as "not loaded yet". */
export function PhoneCell({ row }: { row: RegularRetentionChaseRow }) {
  if (hasPhone(row)) {
    return (
      <span className="tabular-nums text-foreground">
        <CopyableCell text={row.phone!} />
      </span>
    );
  }
  return (
    <span
      className="text-[11px] text-amber-700 dark:text-amber-400"
      title="We have no number for this student, so nobody can ring them from this list."
    >
      No number
    </span>
  );
}

const SOURCE_LABELS: Record<RetentionSource, string> = {
  regular_and_summer: "Regular + summer",
  regular_only: "Regular only",
  summer_only: "Summer only",
};

const SOURCE_HINTS: Record<RetentionSource, string> = {
  regular_and_summer: "These students studied with us last year and came back for the summer.",
  regular_only: "These students studied with us last year but did not do the summer course.",
  summer_only: "These students joined us for the summer and had not studied here before.",
};

function StateBadge({ state }: { state: RetentionState }) {
  const meta = STATE_META[state];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", meta.dot)} />
      <span className={meta.tone}>{meta.label}</span>
    </span>
  );
}

/** The entering grade, drawn the way every other grade badge in the app is
 *  drawn: the palette colour as a solid background with fixed dark grey text.
 *  The grey does not follow the theme because the background does not either,
 *  so the badge reads the same in both.
 *
 *  EnteringGradeBadge rather than the shared GradeBadge, which runs a grade
 *  through the summer pre-grade transform. The row already holds the grade the
 *  student is entering, so transforming it again would move it a year further
 *  on: an F4 would read Pre-F5 every August. */
function GradeBadge({ row }: { row: RegularRetentionChaseRow }) {
  if (!row.expected_grade) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <EnteringGradeBadge
        className="px-1.5 py-0.5 rounded text-[11px] font-semibold text-gray-800"
        grade={row.expected_grade}
        langStream={row.lang_stream?.toUpperCase()}
      />
      {row.rung === "admin_only" && (
        <span
          className="text-[10px] text-muted-foreground"
          title="This grade is not on the public form, so staff enter the application"
        >
          admin only
        </span>
      )}
    </span>
  );
}

function EmptyRow({ span, children }: { span: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={span} className="px-3 py-4 text-center text-muted-foreground italic">
        {children}
      </td>
    </tr>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {hint && <p className="text-xs text-muted-foreground mt-0.5 mb-2">{hint}</p>}
      <div className={cn(wrap, hint ? "" : "mt-2")}>{children}</div>
    </div>
  );
}

/** One breakdown axis. Every axis counts the same measures, so they share a
 *  table rather than growing one component each. */
function AxisTable({
  rows,
  label,
  renderKey,
}: {
  rows: RegularRetentionRow[];
  label: string;
  renderKey?: (key: string) => React.ReactNode;
}) {
  return (
    // Seven columns of numbers squashed into a phone are unreadable, so the
    // table keeps its width and the wrapper around it scrolls.
    <table className="w-full min-w-[34rem] text-xs">
      <thead className={thead}>
        <tr className={theadRow}>
          <th className={th}>{label}</th>
          {/* "Students", not "Cohort". The word is ours, not the centre's. */}
          <th className={thNum}>Students</th>
          <th className={thNum}>Applied</th>
          <th className={thNum}>Not returning</th>
          <th className={thNum}>No response</th>
          {/* Of the unresponsive, not of everybody: under a "no response"
              heading a centre-wide figure reads as this one anyway. */}
          <th
            className={thNum}
            title="How many of the students who have not answered we have already called."
          >
            Called
          </th>
          {/* Worded and explained exactly as the conversion board words it, so
              the two regular boards read the same way. */}
          <th className={thNum} title="Applied as a share of the students in this row">
            Apply %
          </th>
        </tr>
      </thead>
      <tbody className={rowDivide}>
        {rows.length === 0 ? (
          <EmptyRow span={7}>Nothing to show yet.</EmptyRow>
        ) : (
          rows.map((r) => (
            <tr key={r.key} className="hover:bg-[#f0e6d8]/30 dark:hover:bg-[#2a2520]/50">
              <td className="px-3 py-2 text-foreground">
                {renderKey ? renderKey(r.key) : r.label ?? r.key}
              </td>
              <td className={tdNum}>{r.cohort}</td>
              <td className={cn(tdNum, "text-indigo-600 dark:text-indigo-400")}>{r.applied}</td>
              <td className={cn(tdNum, r.declined > 0 && "text-rose-600 dark:text-rose-400")}>
                {r.declined || "-"}
              </td>
              <td className={cn(tdNum, "text-amber-700 dark:text-amber-400")}>{r.no_response}</td>
              <td className={cn(tdNum, "text-muted-foreground")}>
                {r.no_response > 0 ? `${r.no_response_contacted} of ${r.no_response}` : "-"}
              </td>
              <td className={cn(tdNum, "font-semibold")}>{pct(r.applied, r.cohort)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

/** The four ways of slicing the same measures. One table and a switcher rather
 *  than four stacked blocks: the columns never differ, so stacking them only
 *  bought scrolling, and nobody was reading branch and tutor at the same time. */
type BreakdownAxis = {
  key: "branch" | "grade" | "source" | "tutor";
  /** On the button. */
  label: string;
  /** Finishing the sentence "Broken down by ...". */
  heading: string;
  /** The first column's header, which names one row rather than the axis. */
  column: string;
  hint: string;
  rows: (data: RegularRetentionResponse) => RegularRetentionRow[];
  renderKey?: (key: string) => React.ReactNode;
};

const BREAKDOWN_AXES: BreakdownAxis[] = [
  {
    key: "branch",
    label: "Branch",
    heading: "branch",
    column: "Branch",
    hint: "Each student counts at the branch they studied at last year.",
    rows: (d) => d.by_branch,
  },
  {
    key: "grade",
    label: "Entering grade",
    heading: "entering grade",
    column: "Entering",
    hint: "This is the grade each student moves into in September, not the grade on their record today.",
    rows: (d) => d.by_expected_grade,
  },
  {
    key: "source",
    label: "Where they came from",
    heading: "where they came from",
    column: "Source",
    hint: "Students who did both last year's course and this summer are the likeliest to stay.",
    rows: (d) => d.by_source,
    renderKey: (key) => (
      <span title={SOURCE_HINTS[key as RetentionSource] ?? ""}>
        {SOURCE_LABELS[key as RetentionSource] ?? key}
      </span>
    ),
  },
  {
    key: "tutor",
    label: "Tutor",
    heading: "tutor",
    column: "Tutor",
    hint: "These are the students each tutor taught last year.",
    rows: (d) => d.by_tutor,
  },
];

export function RegularRetentionBreakdowns({ data }: { data: RegularRetentionResponse }) {
  const [axisKey, setAxisKey] = useState<BreakdownAxis["key"]>("branch");
  const axis = BREAKDOWN_AXES.find((a) => a.key === axisKey) ?? BREAKDOWN_AXES[0];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Broken down by {axis.heading}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">{axis.hint}</p>
          </div>
          {/* The same pill switcher the chart above uses, so the two places
              where this page changes what it is showing look alike. */}
          <div className="inline-flex bg-muted rounded-full p-0.5 shrink-0 flex-wrap">
            {BREAKDOWN_AXES.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => setAxisKey(a.key)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-full transition-all duration-200",
                  a.key === axisKey
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <div className={cn(wrap, "overflow-x-auto")}>
          <AxisTable rows={axis.rows(data)} label={axis.column} renderKey={axis.renderKey} />
        </div>
      </div>

      <Section
        title="Why they are not returning"
        hint="These are the reasons staff recorded for the students who told us they are leaving. The same reasons appear in the quarterly termination report."
      >
        <table className="w-full text-xs">
          <thead className={thead}>
            <tr className={theadRow}>
              <th className={th}>Reason</th>
              <th className={thNum}>Students</th>
              {/* The reason's share of everybody leaving, so the header has to
                  say what it is a share of. "Share" on its own told nobody. */}
              <th
                className={thNum}
                title="How much of the not-returning group this one reason accounts for."
              >
                % of those leaving
              </th>
            </tr>
          </thead>
          <tbody className={rowDivide}>
            {data.by_decline_reason.length === 0 ? (
              <EmptyRow span={3}>Nobody has been marked as not returning yet.</EmptyRow>
            ) : (
              data.by_decline_reason.map((r) => {
                const config = CATEGORY_CONFIG[r.key];
                const Icon = config?.Icon;
                return (
                  <tr key={r.key} className="hover:bg-[#f0e6d8]/30 dark:hover:bg-[#2a2520]/50">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        {Icon && (
                          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: getCategoryColor(r.key) }} />
                        )}
                        <span className="text-foreground">{r.key}</span>
                      </span>
                    </td>
                    <td className={tdNum}>{r.declined}</td>
                    <td className={cn(tdNum, "text-muted-foreground")}>
                      {pct(r.declined, data.totals.declined)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

/** Records that a family is not coming back.
 *
 *  Writes a termination for the intake's own quarter rather than inventing a
 *  store of its own: the application window sits inside one reporting quarter,
 *  and that quarter already means "didn't come back when lessons resumed". The
 *  upside is that this board and the quarterly termination report read the same
 *  rows instead of drifting apart — which is also why the dialog says so. */
export function NotReturningDialog({
  row,
  year,
  quarter,
  updatedBy,
  onClose,
}: {
  row: RegularRetentionChaseRow;
  year: number;
  quarter: number;
  updatedBy: string;
  onClose: (saved: boolean) => void;
}) {
  const [category, setCategory] = useState<string>("");
  const [reason, setReason] = useState("");
  // Moving branch or finishing school is not a lost customer. Both write the
  // same record; this is the flag that keeps one of them out of the churn
  // figures the quarterly report is built on.
  const [stillWithUs, setStillWithUs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await terminationsAPI.updateRecord(
        row.student_id,
        {
          year,
          quarter,
          reason: reason.trim() || undefined,
          reason_category: category || undefined,
          count_as_terminated: !stillWithUs,
        },
        updatedBy
      );
      onClose(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf8f5] dark:bg-[#1a1a1a] shadow-lg">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          <UserMinus className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          <h2 className="text-sm font-semibold text-foreground flex-1">Mark as not returning</h2>
          <button
            type="button"
            onClick={() => onClose(false)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-sm text-foreground">
            {row.student_name}
            {row.student_code && <span className="text-muted-foreground"> · {row.student_code}</span>}
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Reason</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={cn(selectClass, "w-full")}
            >
              <option value="">Choose a reason</option>
              {TERMINATION_REASON_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="What the parent said"
              className={cn(selectClass, "w-full resize-none")}
            />
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 px-2.5 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={stillWithUs}
              onChange={(e) => setStillWithUs(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs text-foreground">
              They are moving to another branch or finishing school
              <span className="block text-[11px] text-muted-foreground mt-0.5">
                We will record that they left, but not count them as a student we lost.
              </span>
            </span>
          </label>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {stillWithUs
              ? `This records the student as having left in quarter ${quarter} of ${year} without counting towards the quarterly termination figures.`
              : `This also records the student as having left in quarter ${quarter} of ${year}, so the quarterly report and this board stay in agreement.`}{" "}
            You can undo it from this list.
          </p>

          {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
          <button type="button" onClick={() => onClose(false)} className={selectClass}>
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !category}
            className={cn(
              selectClass,
              "text-white disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5",
              stillWithUs
                ? "bg-slate-600 border-slate-600 hover:bg-slate-700"
                : "bg-rose-600 border-rose-600 hover:bg-rose-700"
            )}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {stillWithUs ? "Record as accounted for" : "Mark as not returning"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Puts a student who was marked as leaving back on the list.
 *
 *  A real undo removes the record rather than flipping it to "not counted",
 *  which is a different claim and would leave the student off the board in a
 *  second way. It does throw away whatever reason was typed, so it asks. */
export function UndoNotReturningDialog({
  row,
  year,
  quarter,
  onClose,
}: {
  row: RegularRetentionChaseRow;
  year: number;
  quarter: number;
  onClose: (undone: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const undo = async () => {
    setSaving(true);
    setError(null);
    try {
      await terminationsAPI.deleteRecord(row.student_id, year, quarter);
      onClose(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not undo. Please try again.");
      setSaving(false);
    }
  };

  return (
    <ConfirmDialog
      isOpen
      onConfirm={undo}
      onCancel={() => onClose(false)}
      title="Put this student back on the list?"
      message={
        <>
          {row.student_name} will count as waiting for an answer again.
          {error && <span className="block mt-2 text-rose-600 dark:text-rose-400">{error}</span>}
        </>
      }
      consequences={[
        "The reason recorded against them is removed",
        `They drop out of the quarter ${quarter} ${year} termination report`,
      ]}
      confirmText="Put back on the list"
      variant="warning"
      loading={saving}
    />
  );
}

/** Matches the cap the endpoint enforces. Nobody rings two hundred families in
 *  a sitting, so a batch that large is a mis-click on select-all rather than a
 *  round of calls, and a note claiming otherwise is worse than no note. */
export const BULK_CONTACT_LIMIT = 200;

/** One contact, logged against every student ticked on the list.
 *
 *  Chasing a renewal is a round of calls or one broadcast message, so the
 *  alternative was this form filled in twenty times. Deliberately narrower
 *  than the single-student modal: no student picker, because the selection is
 *  the picker, and one note that is true of all of them.
 *
 *  Used by the office on the admin board and by a tutor on their own list.
 *  Who the contact is recorded as follows the same rule the single-student
 *  modal already uses, so the two ways of logging a call cannot disagree about
 *  whose call it was. */
export function BulkContactDialog({
  rows,
  currentUserEmail,
  onClose,
}: {
  rows: RegularRetentionChaseRow[];
  currentUserEmail: string;
  onClose: (logged: number) => void;
}) {
  const { data: tutors = [] } = useActiveTutors();
  const { user, isAdmin, isImpersonating, effectiveRole, impersonatedTutor } = useAuth();
  const [tutorId, setTutorId] = useState<number | null>(null);
  const [when, setWhen] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<string>(CONTACT_METHODS[0]);
  // Everything logged from this board is a renewal chase, which is the whole
  // reason that type exists. Leaving it on General would make this year's
  // chasing indistinguishable from a routine call the moment a second intake
  // is in the table.
  const [type, setType] = useState<string>(RENEWAL_CONTACT_TYPE);
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whoever is logged in did the calling, so their own name is the default.
  // A super admin looking at a tutor's page is standing in for that tutor, and
  // the call belongs to them rather than to the person clicking, which is the
  // same rule the single-student modal follows.
  const ownTutorId = useMemo(() => {
    if (isImpersonating && effectiveRole === "Tutor" && impersonatedTutor?.id) {
      return impersonatedTutor.id;
    }
    return tutors.find((t) => t.tutor_name === user?.name)?.id ?? null;
  }, [isImpersonating, effectiveRole, impersonatedTutor?.id, tutors, user?.name]);

  // Filled in as soon as the tutor list arrives, and only when there is a name
  // to fill it with. An admin who is not on that list chooses somebody instead,
  // rather than the records landing on nobody.
  useEffect(() => {
    if (tutorId === null && ownTutorId !== null) setTutorId(ownTutorId);
  }, [ownTutorId, tutorId]);

  // A tutor logs their own calls, so the field says who it will be recorded as
  // rather than offering them their colleagues. It stays open if we cannot work
  // out which tutor they are, because a name we failed to match is not a reason
  // to leave them unable to save anything.
  const lockedToSelf = !isAdmin && ownTutorId !== null;

  const save = async () => {
    if (!tutorId) {
      setError("Choose who made the contact.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await parentCommunicationsAPI.createBulk(
        {
          student_ids: rows.map((r) => r.student_id),
          contact_method: method,
          contact_type: type,
          // Noon rather than midnight: the single-student modal sends a local
          // time as UTC too, and from noon the eight-hour shift cannot walk
          // the contact back onto the day before.
          contact_date: new Date(`${when}T12:00:00`).toISOString(),
          brief_notes: notes || undefined,
          follow_up_needed: followUp,
          follow_up_date: followUp && followUpDate ? followUpDate : undefined,
        },
        tutorId,
        currentUserEmail || user?.email || "system"
      );
      onClose(result.created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf8f5] dark:bg-[#1a1a1a] shadow-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          <MessageSquarePlus className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground flex-1">
            Log a contact for {rows.length} student{rows.length === 1 ? "" : "s"}
          </h2>
          <button
            type="button"
            onClick={() => onClose(0)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          {/* Named, not just counted: a wrong tick is easier to spot in a list
              of names than in a number. */}
          <div className="rounded-lg border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 px-2.5 py-2 max-h-24 overflow-y-auto text-xs text-muted-foreground">
            {rows.map((r) => r.student_name).join(", ")}
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Contacted by</label>
            <select
              value={tutorId ?? ""}
              onChange={(e) => setTutorId(e.target.value ? Number(e.target.value) : null)}
              disabled={lockedToSelf}
              className={cn(selectClass, "w-full", lockedToSelf && "opacity-60 cursor-not-allowed")}
            >
              <option value="">Choose a name</option>
              {tutors.map((t) => (
                <option key={t.id} value={t.id}>{t.tutor_name}</option>
              ))}
            </select>
            {lockedToSelf && (
              <p className="text-[11px] text-muted-foreground mt-1">Recording as yourself</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Date</label>
              <input
                type="date"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className={cn(selectClass, "w-full")}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className={cn(selectClass, "w-full")}
              >
                {CONTACT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={cn(selectClass, "w-full")}
            >
              {CONTACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Saved word for word against every student above"
              className={cn(selectClass, "w-full resize-none")}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={followUp}
              onChange={(e) => setFollowUp(e.target.checked)}
            />
            <span className="text-xs text-foreground">Follow-up needed</span>
          </label>
          {followUp && (
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className={cn(selectClass, "w-full")}
            />
          )}

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            This adds one contact record to each of these students, exactly as if you had
            logged them one at a time. They will show as contacted on this board and in each
            student&apos;s own history.
          </p>

          {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
          <button type="button" onClick={() => onClose(0)} className={selectClass}>
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !tutorId}
            className={cn(
              selectClass,
              "bg-primary border-primary text-primary-foreground hover:opacity-90",
              "disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            )}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Log for {rows.length} student{rows.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The ticks on a chase list, and everything that follows from them.
 *
 *  The office's board and a tutor's own list both work a round of calls the
 *  same way, so the counting, the select-all and the message afterwards live
 *  here once instead of being written twice and drifting apart.
 *
 *  `all` is everybody the list could work, and `shown` is what the filters have
 *  left on screen. The two are separate because a selection is built by moving
 *  between filters, so a student can stay ticked while off screen. */
export function useChaseSelection(
  all: RegularRetentionChaseRow[],
  shown: RegularRetentionChaseRow[],
  /** False on a read-only account, which has nothing it could do with a
   *  selection. The rule lives here rather than at each call site, so a list
   *  cannot accidentally offer ticking it will not honour. */
  enabled = true
) {
  // Ticked rows survive a filter change, because narrowing the list is how you
  // build a selection: filter to F2, tick them, filter to F3, tick those.
  const [picked, setPicked] = useState<Set<number>>(new Set());
  // How many the last round was logged for. Kept here so that touching the
  // ticks takes it away: it describes a selection that no longer exists.
  const [logged, setLogged] = useState<number | null>(null);
  // Whether the dialog is open belongs with the ticks it acts on, so a list only
  // has to render the bar and the round works.
  const [bulkOpen, setBulkOpen] = useState(false);

  // The selection is a set of ids, but the dialog wants the rows behind them,
  // and only rows that still exist in the report.
  const pickedRows = useMemo(() => all.filter((r) => picked.has(r.student_id)), [all, picked]);
  const shownPicked = shown.filter((r) => picked.has(r.student_id)).length;
  const allShownPicked = shown.length > 0 && shownPicked === shown.length;

  const onToggle = (studentId: number) => {
    setLogged(null);
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(studentId)) next.add(studentId);
      return next;
    });
  };

  /** Ticks or clears every row currently on screen, leaving anything picked
   *  under an earlier filter alone. */
  const onToggleAll = () => {
    setLogged(null);
    setPicked((current) => {
      const next = new Set(current);
      for (const r of shown) {
        if (allShownPicked) next.delete(r.student_id);
        else next.add(r.student_id);
      }
      return next;
    });
  };

  /** A round has been logged: close the dialog, say how many it was, and start
   *  again empty, so the same call cannot be logged twice by clicking again. */
  const finishLogging = (count: number) => {
    setBulkOpen(false);
    setLogged(count);
    setPicked(new Set());
  };

  return {
    pickedRows,
    logged,
    bulkOpen,
    /** How many are ticked, and how many of those the filters have hidden. */
    selected: picked.size,
    notShown: picked.size - shownPicked,
    openBulk: () => setBulkOpen(true),
    closeBulk: () => setBulkOpen(false),
    clear: () => setPicked(new Set()),
    finishLogging,
    /** Everything the list needs to draw the tick column, and undefined where
     *  ticking is not on offer. */
    selection: enabled ? { picked, allShownPicked, onToggle, onToggleAll } : undefined,
  };
}

export type ChaseSelection = ReturnType<typeof useChaseSelection>;

/** What the ticks can do, what happened the last time they were used, and the
 *  dialog they open.
 *
 *  The bar is only on screen when something is ticked, so the toolbar above it
 *  stays the same height while somebody is working normally. It takes the whole
 *  selection rather than a handful of numbers, because a list that can tick can
 *  always log, and splitting the two left both call sites wiring up the same
 *  dialog and the same after-the-round bookkeeping by hand. */
export function ChaseSelectionBar({
  picks,
  currentUserEmail,
  onLogged,
}: {
  picks: ChaseSelection;
  currentUserEmail: string;
  /** The list has changed underneath: refetch it. */
  onLogged: () => void;
}) {
  const { selected, notShown, logged } = picks;
  return (
    <>
      {selected > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium text-foreground tabular-nums">
            {selected} selected
            {notShown > 0 && (
              <span className="text-muted-foreground font-normal">
                {" "}({notShown} not in this view)
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={picks.openBulk}
            disabled={selected > BULK_CONTACT_LIMIT}
            className={cn(
              selectClass,
              "inline-flex items-center gap-1.5 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Log a contact
          </button>
          {selected > BULK_CONTACT_LIMIT && (
            <span className="text-xs text-amber-700 dark:text-amber-400">
              A contact can be logged for {BULK_CONTACT_LIMIT} students at a time.
            </span>
          )}
          <button
            type="button"
            onClick={picks.clear}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear
          </button>
        </div>
      )}

      {picks.bulkOpen && (
        <BulkContactDialog
          rows={picks.pickedRows}
          currentUserEmail={currentUserEmail}
          onClose={(count) => {
            if (count > 0) {
              picks.finishLogging(count);
              onLogged();
            } else {
              picks.closeBulk();
            }
          }}
        />
      )}

      {/* Said once, where the ticks were, rather than as a toast that is gone
          before the list finishes reloading. */}
      {logged !== null && (
        <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-3">
          Contact logged for {logged} student{logged === 1 ? "" : "s"}.
        </p>
      )}
    </>
  );
}

/** What the six state buttons say, in the order they read. Five of them are
 *  the states a student can be in and take their wording and their colour from
 *  the badge in the table, so pressing "Not returning" and reading "Not
 *  returning" down the Status column are visibly the same thing. */
const STATE_BUTTON_LABEL: Record<RetentionState | "all", string> = {
  no_response: STATE_META.no_response.label,
  applied: STATE_META.applied.label,
  enrolled: STATE_META.enrolled.label,
  declined: STATE_META.declined.label,
  not_churn: STATE_META.not_churn.label,
  all: "Everyone",
};

/** The row a set of filter buttons lives in.
 *
 *  One swipeable line on a phone rather than three wrapped ones. Ten buttons
 *  carrying labels and counts wrap to five lines at that width, and the toolbar
 *  was eating half the screen above a list that is the entire point of the
 *  page. Same treatment the prospect board's branch chips use, including the
 *  fade off the right edge, which is what says there is more to swipe to.
 *
 *  The negative margin lets the rail run to the card's edge, so a chip cut off
 *  mid-scroll reads as scrolled rather than as broken. It only works where the
 *  padding it cancels is the card's own 4, which is why `bleed` is a choice:
 *  inside the filter row the rail sits in the padding like everything else.
 *
 *  `wrapped` is for chips inside the phone's filter menu, where the menu sets
 *  the width and there is nowhere sideways to scroll to. */
export function ChipRail({
  children,
  bleed,
  wrapped,
}: {
  children: React.ReactNode;
  bleed?: boolean;
  wrapped?: boolean;
}) {
  if (wrapped) {
    return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
  }
  return (
    <div className={cn(bleed ? "-mx-4 sm:mx-0" : "w-full sm:w-auto")}>
      <div
        className={cn(
          "flex sm:flex-wrap items-center gap-1.5 overflow-x-auto sm:overflow-visible touch-pan-x",
          bleed && "px-4 sm:px-0",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "[mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] sm:[mask-image:none]"
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** One filter button: what it selects, and how many students are behind it. */
export function FilterChip({
  active,
  count,
  onClick,
  title,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border transition-colors",
        // Narrower and a point smaller on a phone, so less of the rail has to
        // be swiped past. The height stays where it is: these are tapped, and
        // a chip you have to aim at is worse than one more swipe.
        "px-2 py-1 text-[11px] sm:gap-1.5 sm:px-2.5 sm:text-xs",
        active
          ? "border-primary/50 bg-primary/10 text-foreground font-medium"
          : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40",
        // An empty list is still worth being able to open, but it should not
        // compete for the eye with the ones that have people in them.
        !active && count === 0 && "opacity-60"
      )}
    >
      {children}
      <span className="tabular-nums opacity-60">{count}</span>
    </button>
  );
}

/** Which of the six lists is on screen.
 *
 *  A row of buttons rather than a dropdown, because this is not really a
 *  filter: it is the question the page is answering, and which one you are on
 *  should be readable without opening anything. The counts are the other
 *  reason. A button reading "No response 578" says where the work is; the
 *  dropdown it replaces read "No response" and said nothing at all. */
function StateButtons({
  counts,
  value,
  onChange,
}: {
  counts: Record<RetentionState | "all", number>;
  value: RetentionState | "all";
  onChange: (next: RetentionState | "all") => void;
}) {
  return (
    <ChipRail bleed>
      {CHASE_STATES.map((key) => (
        <FilterChip
          key={key}
          active={key === value}
          count={counts[key]}
          onClick={() => onChange(key)}
        >
          {key !== "all" && (
            // Kept at every width: it is the same dot the Status column and
            // the cards put beside the same word, and it costs six pixels.
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATE_META[key].dot)} />
          )}
          {STATE_BUTTON_LABEL[key]}
        </FilterChip>
      ))}
    </ChipRail>
  );
}

/** How far the chasing has got with a family, and whether it can happen at
 *  all. Buttons rather than a dropdown for the same reason as above: each one
 *  carries the number of students behind it, and "No number 24" is a piece of
 *  news about the list rather than an option buried in a menu. */
const CONTACT_LABEL: Record<Exclude<ContactFilter, "">, string> = {
  no: "Never contacted",
  yes: "Contacted before",
  due: "Follow-up due",
  nophone: "No number",
};

const CONTACT_HINT: Record<Exclude<ContactFilter, "">, string> = {
  no: "Nobody has rung or messaged these students' parents about September yet.",
  yes: "Somebody has already been in touch about September.",
  due: "Somebody promised to ring back, and the day has come.",
  nophone: "We hold no number for these students, so nobody can ring them from this list.",
};

function ContactButtons({
  counts,
  value,
  onChange,
  wrapped,
}: {
  counts: Record<Exclude<ContactFilter, "">, number>;
  value: ContactFilter;
  onChange: (next: ContactFilter) => void;
  wrapped?: boolean;
}) {
  return (
    <ChipRail wrapped={wrapped}>
      {CONTACT_FILTERS.map((key) => (
        <FilterChip
          key={key}
          active={key === value}
          count={counts[key]}
          title={CONTACT_HINT[key]}
          // Pressing the one that is already on clears it, so getting back to
          // the whole list never means hunting for a reset.
          onClick={() => onChange(key === value ? "" : key)}
        >
          {CONTACT_LABEL[key]}
        </FilterChip>
      ))}
    </ChipRail>
  );
}

/** The filters the phone hides behind a button, which is everything except the
 *  search box and the state chips. */
const NARROWING_KEYS = ["grade", "tutor", "source", "contact"] as const;

/** A control in the phone's filter menu, where it needs saying what it is,
 *  and the same control in the toolbar, where its own text already says. */
function FilterField({
  menu,
  label,
  children,
}: {
  menu: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (!menu) return <>{children}</>;
  return (
    <div>
      <span className="block mb-1 text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** Every way of narrowing the list, written once and rendered at two widths.
 *
 *  They run in the order the columns run in below: the entering grade, then
 *  the tutor, then where the student came from, then how the chasing is going,
 *  which is what the phone and last-contact columns show. The source moved up
 *  out of the old arrangement, where it sat on the far side of the chips and
 *  made the row read as a jumble of two kinds of control. Dropdowns together,
 *  buttons together. */
function NarrowFilters({
  menu,
  filters,
  set,
  options,
  contactCounts,
}: {
  menu: boolean;
  filters: ChaseFilters;
  set: <K extends keyof ChaseFilters>(key: K, value: ChaseFilters[K]) => void;
  options: { grades: string[]; tutors: string[] };
  contactCounts: Record<Exclude<ContactFilter, "">, number>;
}) {
  const field = menu ? cn(selectClass, "w-full") : selectClass;
  return (
    <>
      <FilterField menu={menu} label="Entering grade">
        <select
          aria-label="Entering grade"
          value={filters.grade}
          onChange={(e) => set("grade", e.target.value)}
          className={field}
        >
          <option value="">All grades</option>
          {options.grades.map((g) => <option key={g} value={g}>Entering {g}</option>)}
        </select>
      </FilterField>
      {options.tutors.length > 1 && (
        <FilterField menu={menu} label="Tutor">
          <select
            aria-label="Tutor"
            value={filters.tutor}
            onChange={(e) => set("tutor", e.target.value)}
            className={field}
          >
            <option value="">All tutors</option>
            {options.tutors.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </FilterField>
      )}
      <FilterField menu={menu} label="Where they came from">
        <select
          aria-label="Where they came from"
          value={filters.source}
          onChange={(e) => set("source", e.target.value)}
          className={field}
        >
          <option value="">All sources</option>
          {(Object.keys(SOURCE_LABELS) as RetentionSource[]).map((s) => (
            <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
          ))}
        </select>
      </FilterField>
      <FilterField menu={menu} label="How the chasing is going">
        <ContactButtons
          counts={contactCounts}
          value={filters.contact}
          onChange={(contact) => set("contact", contact)}
          wrapped={menu}
        />
      </FilterField>
    </>
  );
}

/** The same four filters behind one button, for a toolbar with no room for
 *  them.
 *
 *  Laid out in a row they wrap to four lines at 390px, and with the search box
 *  and the state chips above them the toolbar was six lines deep before the
 *  first student appeared, on a screen that fits about ten. Here they are one
 *  tap away and the toolbar is three lines. Once the toolbar is wide enough the
 *  button is not rendered and the filters sit in it instead, where there is
 *  room to read them at a glance. */
function MoreFilters({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu
      // The menu is portalled to the body, so no class here can follow the
      // width of the toolbar the button sits in: it is not inside the
      // container being measured. DropdownMenu closes itself when its trigger
      // stops being drawn instead, which is what happens to this button when
      // the window is turned and the toolbar grows enough to hold the filters
      // itself.
      menuClassName="w-[16rem] p-3 space-y-3"
      trigger={({ open, triggerProps }) => (
        <button
          type="button"
          {...triggerProps}
          className={cn(
            selectClass,
            "inline-flex shrink-0 items-center gap-1.5",
            count > 0 && "border-primary/50 bg-primary/10 font-medium",
            open && "ring-1 ring-primary/30"
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {count > 0 && (
            <span className="min-w-[1rem] rounded-full bg-primary px-1 text-center text-[10px] leading-4 text-primary-foreground tabular-nums">
              {count}
            </span>
          )}
        </button>
      )}
    >
      {() => (
        <>
          {children}
          {count > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear these filters
            </button>
          )}
        </>
      )}
    </DropdownMenu>
  );
}

/** The chase list itself: cards on a phone, the table from a tablet up.
 *
 *  Shared by the admin board and a tutor's own list, which used to be two
 *  different renderings of the same rows. A tutor gets no Tutor column, because
 *  every row is theirs, and a read-only account gets no ticking, because there
 *  is nothing it could do with a selection. Everything else is the same table,
 *  so the two of them reading the same student are looking at the same thing.
 */
export function ChaseListBody({
  rows,
  today,
  isReadOnly,
  sort,
  onSort,
  emptyText,
  showBranch = true,
  showTutor = true,
  selection,
  onContact,
  onDecline,
  onUndo,
}: {
  rows: RegularRetentionChaseRow[];
  today: string;
  isReadOnly: boolean;
  sort: ChaseSort;
  onSort: (key: ChaseSortKey) => void;
  emptyText: string;
  showBranch?: boolean;
  showTutor?: boolean;
  /** Ticking, when the caller has something to do with a selection. Left out
   *  entirely rather than switched off, so there is no half-built checkbox
   *  column with nothing behind it. */
  selection?: {
    picked: Set<number>;
    allShownPicked: boolean;
    onToggle: (studentId: number) => void;
    onToggleAll: () => void;
  };
  onContact: (row: RegularRetentionChaseRow) => void;
  onDecline: (row: RegularRetentionChaseRow) => void;
  onUndo: (row: RegularRetentionChaseRow) => void;
}) {
  // Code, student, entering, phone, last contacted, status and the actions
  // column, plus whichever of the three optional ones are in play.
  const columnCount =
    7 + (selection ? 1 : 0) + (showBranch ? 1 : 0) + (showTutor ? 1 : 0);

  // The prospect record opens over the list rather than taking the reader to
  // another page, the same way it opens over the applications pages. It holds
  // the phone numbers, the WeChat id and what the primary tutor wrote about
  // the family, which is what somebody about to ring them wants in front of
  // them. The list owns it rather than each page, so both get it. The fetch
  // only fires once something is opened, and the chip refuses to open for
  // anyone who cannot read the record anyway.
  const prospectPreview = useProspectPreview();

  const SortHeader = ({ k, children }: { k: ChaseSortKey; children: React.ReactNode }) => {
    const active = sort.key === k;
    const Arrow = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th className={th}>
        <button
          type="button"
          onClick={() => onSort(k)}
          className={cn("inline-flex items-center gap-1 hover:text-primary", active && "text-primary")}
        >
          {children}
          <Arrow className={cn("h-3 w-3", active ? "text-primary" : "text-muted-foreground/50")} />
        </button>
      </th>
    );
  };

  return (
    <>
      {/* Cards on a phone, the table from a tablet up. The select-all sits
          above them because on a table it lives in the header row. */}
      {selection && rows.length > 0 && (
        <label className="md:hidden flex items-center gap-2 mb-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={selection.allShownPicked}
            onChange={selection.onToggleAll}
          />
          Select all {rows.length} shown
        </label>
      )}
      <div className="md:hidden flex-1 min-h-0 overflow-auto space-y-2">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1 py-4 text-center">{emptyText}</p>
        ) : (
          rows.map((r) => (
            <ChaseCard
              key={r.student_id}
              row={r}
              today={today}
              isReadOnly={isReadOnly}
              showTutor={showTutor}
              picked={selection?.picked.has(r.student_id) ?? false}
              onPick={selection && (() => selection.onToggle(r.student_id))}
              onProspectClick={prospectPreview.open}
              onContact={() => onContact(r)}
              onDecline={() => onDecline(r)}
              onUndo={() => onUndo(r)}
            />
          ))
        )}
      </div>

      {/* Table */}
      <div className={cn(wrap, "hidden md:block flex-1 min-h-0 overflow-auto")}>
        <table className="w-full text-xs">
          <thead className={cn(thead, "sticky top-0 z-10")}>
            <tr className={theadRow}>
              {selection && (
                <th className={cn(th, "w-8")}>
                  <input
                    type="checkbox"
                    checked={selection.allShownPicked}
                    onChange={selection.onToggleAll}
                    disabled={rows.length === 0}
                    aria-label={
                      selection.allShownPicked ? "Clear every row shown" : "Select every row shown"
                    }
                    title={
                      selection.allShownPicked ? "Clear every row shown" : "Select every row shown"
                    }
                  />
                </th>
              )}
              <SortHeader k="student_code">Code</SortHeader>
              <SortHeader k="student_name">Student</SortHeader>
              <SortHeader k="expected_grade">Entering</SortHeader>
              {showBranch && <SortHeader k="branch">Branch</SortHeader>}
              {showTutor && <SortHeader k="tutor_name">Tutor</SortHeader>}
              <th className={th}>Phone</th>
              <SortHeader k="days_since_contact">Last contacted</SortHeader>
              <th className={th}>Status</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody className={rowDivide}>
            {rows.length === 0 ? (
              <EmptyRow span={columnCount}>{emptyText}</EmptyRow>
            ) : (
              rows.map((r) => {
                const due = isFollowUpDue(r, today);
                return (
                  <tr key={r.student_id} className="hover:bg-[#f0e6d8]/30 dark:hover:bg-[#2a2520]/50">
                    {selection && (
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={selection.picked.has(r.student_id)}
                          onChange={() => selection.onToggle(r.student_id)}
                          aria-label={`Select ${r.student_name}`}
                        />
                      </td>
                    )}
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {r.student_code ? (
                        <StudentCodeBadge code={r.student_code} />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        <StudentLink row={r} className="text-foreground font-medium" />
                        <ProspectJourneyChip
                          journey={r.prospect_journey}
                          trail={false}
                          onProspectClick={prospectPreview.open}
                        />
                      </span>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap"><GradeBadge row={r} /></td>
                    {showBranch && (
                      <td className="px-3 py-1.5 text-muted-foreground">{r.branch ?? "-"}</td>
                    )}
                    {showTutor && (
                      <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                        {r.tutor_name ?? "-"}
                      </td>
                    )}
                    <td className="px-3 py-1.5 whitespace-nowrap"><PhoneCell row={r} /></td>
                    <td className="px-3 py-1.5 max-w-[13rem]">
                      <div className="whitespace-nowrap">
                        {/* Never contacted is the front of the queue, so it reads
                            as a state rather than as missing data. */}
                        {r.last_contact_date == null ? (
                          <span className="text-amber-700 dark:text-amber-400 font-medium">Never</span>
                        ) : (
                          <span className="text-muted-foreground tabular-nums">
                            {shortDate(r.last_contact_date)}
                            <span className="text-muted-foreground/70"> · {r.days_since_contact}d</span>
                          </span>
                        )}
                        {r.follow_up_needed && r.follow_up_date && (
                          <span
                            className={cn(
                              "ml-1.5 px-1 py-0.5 rounded text-[10px] font-medium whitespace-nowrap",
                              due
                                ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                                : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
                            )}
                            title={`Someone promised to follow up on ${r.follow_up_date}`}
                          >
                            {due ? "due" : shortDate(r.follow_up_date)}
                          </span>
                        )}
                      </div>
                      {/* What was said, so the next caller opens with it
                          instead of asking the family the same question. */}
                      {r.last_contact_note && (
                        <div
                          className="text-[11px] text-muted-foreground/80 truncate"
                          title={r.last_contact_note}
                        >
                          {r.last_contact_note}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <StateBadge state={r.state} />
                      <span className="ml-1.5"><LadderRung row={r} /></span>
                      {r.decline_reason_category && r.state !== "declined" && (
                        <span
                          className="ml-1.5 text-[10px] text-rose-600 dark:text-rose-400"
                          title="Somebody marked this student as not returning, but they have a live application. Worth checking."
                        >
                          conflict
                        </span>
                      )}
                      {r.state === "declined" && r.decline_reason_category && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          {r.decline_reason_category}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {!isReadOnly && (
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            type="button"
                            onClick={() => onContact(r)}
                            title="Log a contact about this student"
                            className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary"
                          >
                            <MessageSquarePlus className="h-3.5 w-3.5" />
                          </button>
                          {isRecordedAsLeaving(r.state) ? (
                            <button
                              type="button"
                              onClick={() => onUndo(r)}
                              title="Put this student back on the list"
                              className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary"
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onDecline(r)}
                              title="Mark this student as not returning"
                              className="p-1.5 rounded hover:bg-rose-500/10 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
                            >
                              <UserMinus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Saving only touches the outreach status, the relationship status and
          the notes, none of which this list shows, so the record is dropped
          from the cache and the board is left alone. */}
      {prospectPreview.prospect && (
        <ProspectDetailModal
          prospect={prospectPreview.prospect}
          onClose={prospectPreview.close}
          onSave={prospectPreview.invalidate}
          readOnly={isReadOnly}
        />
      )}
    </>
  );
}

/** Where an application has got to, next to the word "Applied".
 *
 *  "Applied" covers everything from a form filled in last night to a family
 *  waiting to pay, and the rung is the same one the parent reads on their own
 *  status page, so both sides of a phone call are looking at the same words.
 *  Only for applications: an enrolled student's rung says "Enrolled" too. */
export function LadderRung({ row }: { row: RegularRetentionChaseRow }) {
  if (row.state !== "applied" || !row.application_status) return null;
  return (
    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
      {regularStatusLabel(row.application_status, "en")}
    </span>
  );
}

/** One student as a card, for phones.
 *
 *  The table is nine columns wide and a phone shows about three of them, so a
 *  tutor's own list got cards from the start while an admin on the same phone
 *  got a sideways scroll. This is the admin's row with the same information in
 *  a column: everything the table shows, plus the tick and the two actions,
 *  which are labelled here because a 14px icon is a poor touch target. */
function ChaseCard({
  row,
  today,
  isReadOnly,
  showTutor = true,
  picked = false,
  onPick,
  onProspectClick,
  onContact,
  onDecline,
  onUndo,
}: {
  row: RegularRetentionChaseRow;
  today: string;
  isReadOnly: boolean;
  showTutor?: boolean;
  picked?: boolean;
  /** Absent where there is nothing to do with a selection, which is a
   *  read-only account looking at either list. */
  onPick?: () => void;
  onProspectClick: (prospectId: number) => void;
  onContact: () => void;
  onDecline: () => void;
  onUndo: () => void;
}) {
  const due = isFollowUpDue(row, today);
  const leaving = isRecordedAsLeaving(row.state);

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5",
        picked
          ? "border-primary/50 bg-primary/5"
          : "border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 bg-white/40 dark:bg-white/[0.02]"
      )}
    >
      <div className="flex items-start gap-2.5">
        {!isReadOnly && onPick && (
          <input
            type="checkbox"
            checked={picked}
            onChange={onPick}
            aria-label={`Select ${row.student_name}`}
            className="mt-1 shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {row.student_code && <StudentCodeBadge code={row.student_code} />}
            <StudentLink row={row} className="text-sm font-medium text-foreground" />
            <ProspectJourneyChip
              journey={row.prospect_journey}
              trail={false}
              onProspectClick={onProspectClick}
            />
            <span className="ml-auto shrink-0 inline-flex items-center gap-1.5">
              <LadderRung row={row} />
              <StateBadge state={row.state} />
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs text-muted-foreground">
            <GradeBadge row={row} />
            {row.branch && <span>{row.branch}</span>}
            {showTutor && row.tutor_name && <span>{row.tutor_name}</span>}
          </div>

          <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs">
            <PhoneCell row={row} />
            {row.last_contact_date == null ? (
              <span className="text-amber-700 dark:text-amber-400 font-medium">
                Never contacted
              </span>
            ) : (
              <span className="text-muted-foreground">
                last contacted {shortDate(row.last_contact_date)} · {row.days_since_contact}d ago
              </span>
            )}
            {row.follow_up_needed && row.follow_up_date && (
              <span
                className={cn(
                  due
                    ? "text-rose-600 dark:text-rose-400 font-medium"
                    : "text-sky-700 dark:text-sky-400"
                )}
              >
                {due ? "follow-up due" : `follow up ${shortDate(row.follow_up_date)}`}
              </span>
            )}
          </div>

          {row.last_contact_note && (
            <p className="text-xs text-muted-foreground/80 mt-1.5 line-clamp-2">
              {row.last_contact_note}
            </p>
          )}

          {row.decline_reason_category && (
            <p
              className={cn(
                "text-xs mt-1.5",
                leaving ? "text-muted-foreground" : "text-rose-600 dark:text-rose-400"
              )}
            >
              {leaving
                ? row.decline_reason_category
                : `Marked as not returning (${row.decline_reason_category}) but has a live application. Worth checking.`}
            </p>
          )}

          {!isReadOnly && (
            <div className="flex items-center gap-2 mt-2.5">
              <button
                type="button"
                onClick={onContact}
                className={cn(selectClass, "text-xs py-1 inline-flex items-center gap-1.5")}
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Log a contact
              </button>
              {leaving ? (
                <button
                  type="button"
                  onClick={onUndo}
                  className={cn(selectClass, "text-xs py-1 inline-flex items-center gap-1.5")}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Put back on the list
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onDecline}
                  className={cn(
                    selectClass,
                    "text-xs py-1 inline-flex items-center gap-1.5",
                    "text-rose-600 dark:text-rose-400"
                  )}
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  Not returning
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function RegularRetentionChaseList({
  data,
  isReadOnly,
  currentUserEmail,
  onChanged,
}: {
  data: RegularRetentionResponse;
  isReadOnly: boolean;
  currentUserEmail: string;
  onChanged: () => void;
}) {
  // The list arrives whole so the page can filter without a second request.
  // Unresponsive students are the work, so that is where it opens.
  const [filters, setFilters] = useState<ChaseFilters>(EMPTY_CHASE_FILTERS);
  const [sort, setSort] = useState<ChaseSort>(DEFAULT_CHASE_SORT);
  const [restored, setRestored] = useState(false);
  const [contactFor, setContactFor] = useState<RegularRetentionChaseRow | null>(null);
  const [declineFor, setDeclineFor] = useState<RegularRetentionChaseRow | null>(null);
  const [undoFor, setUndoFor] = useState<RegularRetentionChaseRow | null>(null);

  // Read on mount rather than in useState, so the server and the first client
  // render agree and hydration stays quiet.
  useEffect(() => {
    const params = currentQuery();
    setFilters(chaseFiltersFromQuery(params));
    setSort(parseChaseSort(params.get("sort")));
    setRestored(true);
  }, []);

  // A narrowed list is worth handing to whoever is making the calls, and the
  // way you hand over a view is to hand over its URL. Nothing is written until
  // the read above has happened, or the defaults would wipe the link that was
  // just followed. The search box waits for a pause in the typing, since every
  // write is a navigation and a name is a dozen of them.
  const settledQuery = useDebouncedValue(filters.q, 300);
  useQuerySync(
    {
      ...chaseFiltersToQuery({ ...filters, q: settledQuery }),
      sort: formatChaseSort(sort) || null,
    },
    restored
  );

  const set = <K extends keyof ChaseFilters>(key: K, value: ChaseFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Everybody this list can actually work.
  //
  // A student entering a grade the centre does not teach has nothing to apply
  // for, so they are not waiting to answer us and nobody should be ringing
  // them. They are named on the overview instead, under the students we are
  // not counting. Leaving them here would also put a number on the "No
  // response" button that disagreed with the one on the tab an inch above it,
  // because the tab counts the same students out of the totals.
  const chaseable = useMemo(() => data.chase.filter((r) => r.rung !== "none"), [data.chase]);
  const heldOut = data.chase.length - chaseable.length;

  const options = useMemo(() => {
    const grades = new Set<string>();
    const tutors = new Set<string>();
    const branches = new Set<string>();
    for (const r of chaseable) {
      if (r.expected_grade) grades.add(r.expected_grade);
      if (r.tutor_name) tutors.add(r.tutor_name);
      if (r.branch) branches.add(r.branch);
    }
    return {
      grades: [...grades].sort(),
      tutors: [...tutors].sort(),
      branchCount: branches.size,
    };
  }, [chaseable]);

  const rows = useMemo(
    () => sortChaseRows(filterChaseRows(chaseable, filters, today), sort.key, sort.dir),
    [chaseable, filters, sort, today]
  );

  // Each button's own number: what it would show if you pressed it, with
  // everything else on the toolbar left as it is.
  const stateCounts = useMemo(
    () => countChaseStates(chaseable, filters, today),
    [chaseable, filters, today]
  );
  const contactCounts = useMemo(
    () => countChaseContact(chaseable, filters, today),
    [chaseable, filters, today]
  );

  // Compared key by key rather than by stringifying the pair, which quietly
  // depended on both objects listing their keys in the same order.
  const filtersActive = CHASE_QUERY_KEYS.some((k) => filters[k] !== EMPTY_CHASE_FILTERS[k]);

  // What the untouched order actually is, which depends on the list you are
  // on. The server puts the unresponsive students first and then groups by
  // branch, entering grade and name, so on every list except "Everyone" the
  // first half of that has already been done by the filter and naming it
  // describes nothing. What you are looking at there is one class at a time,
  // and the branch only earns a mention when more than one is in the report.
  const defaultOrderLabel =
    filters.state === "all"
      ? "Unresponsive first"
      : options.branchCount > 1
        ? "By branch and grade"
        : "By entering grade";

  // What the Filters button is holding on a phone. The search box and the
  // state chips are not counted, because they are on screen either way, and a
  // badge should only ever stand for something you cannot see.
  const narrowCount = NARROWING_KEYS.filter((k) => filters[k] !== EMPTY_CHASE_FILTERS[k]).length;
  const clearNarrowing = () =>
    setFilters((f) => ({ ...f, grade: "", tutor: "", source: "", contact: "" }));

  // The same ticking a tutor gets on their own list, so a round of calls is
  // logged the same way whoever is making it.
  const picks = useChaseSelection(chaseable, rows, !isReadOnly);

  const onSort = (k: ChaseSortKey) =>
    setSort((s) =>
      s.key === k
        ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" }
        // Staleness is the call queue, so it opens with the most overdue first.
        : { key: k, dir: k === "days_since_contact" ? "desc" : "asc" }
    );

  /** Exports what is on screen, not the whole report — a filtered view is a
   *  call sheet for one person, and that is what someone wants to hand over. */
  const exportView = () => {
    const header = [
      "Code", "Student", "Entering", "Branch", "Tutor", "Phone",
      "Last contacted", "Days since", "Follow up", "State", "Reason", "Last note",
    ];
    const cell = (v: string | number | null | undefined) => {
      const s = String(v ?? "");
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = rows.map((r) => [
      r.student_code, r.student_name, r.expected_grade, r.branch, r.tutor_name, r.phone,
      r.last_contact_date ? r.last_contact_date.slice(0, 10) : "",
      r.days_since_contact, r.follow_up_date, STATE_META[r.state].label,
      r.decline_reason_category, r.last_contact_note,
    ]);
    const csv =
      String.fromCharCode(0xfeff) +
      [header, ...body].map((line) => line.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `chase-list-${data.year}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Which of the six lists is on screen. Its own row, because it is the
          question the page is answering rather than one more way to narrow. */}
      <StateButtons
        counts={stateCounts}
        value={filters.state}
        onChange={(state) => set("state", state)}
      />

      {/* Who is on it. Searching by name is the one thing done constantly, so
          it stays in the toolbar at every width. The four ways of narrowing sit
          beside it when the toolbar is wide and behind the Filters button when
          it is not, which is the difference between a three-line toolbar and a
          six-line one.

          Two zones rather than one wrapping row: the count and the buttons on
          the right used to be pushed over by ml-auto, which meant they landed
          on whichever line happened to have room and moved as filters were
          added.

          The widths below are the toolbar's own, not the window's, which is why
          this is a container rather than a run of sm: and lg: classes. Two
          things made the window the wrong thing to measure. The sidebar takes
          256px from md up, so a 1024px window leaves the toolbar about 670px
          and a 768px one leaves it about 420px, and the toolbar cannot see that
          from a media query. And a Z Fold's inner screen reports about 673px,
          which is past sm, so it used to get the wide two-zone layout in a
          space that had no room for it: the right-hand zone is shrink-0 and
          takes about 356px there, the left-hand zone was squeezed to roughly
          200px, and every filter fell onto a line of its own with the list
          pushed off the bottom of the card. */}
      <div className="@container/chase mt-2 mb-3">
        <div className="flex flex-col gap-2 @2xl/chase:flex-row @2xl/chase:items-start @2xl/chase:justify-between @2xl/chase:gap-4">
          <div className="flex items-center gap-2 min-w-0 @2xl/chase:flex-wrap">
            <div className="relative flex-1 min-w-0 @2xl/chase:flex-none @2xl/chase:w-auto">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={filters.q}
                onChange={(e) => set("q", e.target.value)}
                placeholder="Name, code or phone"
                // w-56 rather than w-52: the hint is 146px wide and the search
                // icon eats 32px of the field, so anything narrower cut it off
                // at "Name, code or phon".
                className={cn(selectClass, "pl-8 w-full @2xl/chase:w-56")}
              />
            </div>
            {/* 56rem is where all four fit on one line beside the search box.
                The search box and the three dropdowns need about 660px between
                them, and the right-hand zone and the gap take about 194px of
                the toolbar before they get any, so below that the button is
                both shorter and easier to read than dropdowns stacked one to
                a line. */}
            <span className="@4xl/chase:hidden">
              <MoreFilters count={narrowCount} onClear={clearNarrowing}>
                <NarrowFilters
                  menu
                  filters={filters}
                  set={set}
                  options={options}
                  contactCounts={contactCounts}
                />
              </MoreFilters>
            </span>
            {/* `contents` so the controls join the row above rather than
                sitting in a box of their own, which is what would break the
                wrapping. */}
            <div className="hidden @4xl/chase:contents">
              <NarrowFilters
                menu={false}
                filters={filters}
                set={set}
                options={options}
                contactCounts={contactCounts}
              />
            </div>
          </div>

          {/* Wraps rather than overflowing: on a narrow toolbar this sits on a
              line of its own under the search box, and the three of them only
              just fit across a phone. */}
          <div className="flex flex-wrap items-center gap-2 @2xl/chase:flex-nowrap @2xl/chase:shrink-0">
            <span className="text-xs text-muted-foreground tabular-nums">
              {rows.length} of {chaseable.length}
            </span>
            {/* Sorting lives in the column headers, and the cards a narrow
                screen gets have no headers, so that width gets the same orders
                as a menu. It follows the window rather than the toolbar because
                what it stands in for is the table, and that is still a media
                query. */}
            <select
              value={formatChaseSort(sort)}
              onChange={(e) => setSort(parseChaseSort(e.target.value))}
              className={cn(selectClass, "md:hidden")}
              aria-label="Sort the list"
            >
              <option value="">{defaultOrderLabel}</option>
              <option value="days_since_contact:desc">Longest waiting first</option>
              <option value="student_name:asc">By name</option>
              <option value="expected_grade:asc">By entering grade</option>
            </select>
            {filtersActive && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_CHASE_FILTERS)}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={exportView}
              disabled={rows.length === 0}
              title="Download the rows shown as a call sheet"
              className={cn(selectClass, "inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed")}
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export view</span>
            </button>
          </div>
        </div>
      </div>

      <ChaseSelectionBar
        picks={picks}
        currentUserEmail={currentUserEmail}
        onLogged={onChanged}
      />

      <ChaseListBody
        rows={rows}
        today={today}
        isReadOnly={isReadOnly}
        sort={sort}
        onSort={onSort}
        emptyText="Nobody matches these filters."
        selection={picks.selection}
        onContact={setContactFor}
        onDecline={setDeclineFor}
        onUndo={setUndoFor}
      />

      {/* Said here as well as on the overview, because a list that quietly
          holds somebody back is worse than one that says who and why. */}
      {heldOut > 0 && (
        <p className="text-[11px] text-muted-foreground mt-2 shrink-0">
          {heldOut === 1
            ? "One more student is entering a grade we do not teach, so there is nothing for them to apply for and they are not on this list."
            : `${heldOut} more students are entering a grade we do not teach, so there is nothing for them to apply for and they are not on this list.`}{" "}
          The overview names them.
        </p>
      )}

      {contactFor && (
        <RecordContactModal
          isOpen
          onClose={(saved) => {
            setContactFor(null);
            if (saved) onChanged();
          }}
          editingContact={null}
          preselectedStudentId={contactFor.student_id}
          defaultContactType={RENEWAL_CONTACT_TYPE}
        />
      )}

      {declineFor && (
        <NotReturningDialog
          row={declineFor}
          year={data.intake_year}
          quarter={data.intake_quarter}
          updatedBy={currentUserEmail}
          onClose={(saved) => {
            setDeclineFor(null);
            if (saved) onChanged();
          }}
        />
      )}

      {undoFor && (
        <UndoNotReturningDialog
          row={undoFor}
          year={data.intake_year}
          quarter={data.intake_quarter}
          onClose={(undone) => {
            setUndoFor(null);
            if (undone) onChanged();
          }}
        />
      )}
    </div>
  );
}
