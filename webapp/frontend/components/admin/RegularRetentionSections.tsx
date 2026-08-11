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
  Undo2,
  UserMinus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parentCommunicationsAPI, terminationsAPI } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveTutors } from "@/lib/hooks";
import { getGradeColor } from "@/lib/regular-utils";
import {
  CATEGORY_CONFIG,
  TERMINATION_REASON_CATEGORIES,
  getCategoryColor,
} from "@/lib/termination-constants";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyableCell, StudentCodeBadge } from "@/components/summer/prospect-badges";
import { RecordContactModal } from "@/components/parent-contacts/RecordContactModal";
import { CONTACT_METHODS, CONTACT_TYPES } from "@/components/parent-contacts/contact-utils";
import {
  EMPTY_CHASE_FILTERS,
  filterChaseRows,
  hasPhone,
  isFollowUpDue,
  shortDate,
  sortChaseRows,
  type ChaseFilters,
  type ChaseSortKey,
} from "@/lib/retention-utils";
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
  row: RegularRetentionChaseRow;
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
      title="No number on file, so this family cannot be rung from here"
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
  regular_and_summer: "Studied last year and did summer — the strongest signal there is",
  regular_only: "Studied last year, skipped summer",
  summer_only: "Came in through summer with no regular history",
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

/** The entering grade, coloured on the shared grade+stream palette so a grade
 *  reads the same here as on every other regular page. */
function GradeBadge({ row }: { row: RegularRetentionChaseRow }) {
  if (!row.expected_grade) return <span className="text-muted-foreground">-</span>;
  const stream = row.lang_stream ? row.lang_stream.toUpperCase() : "";
  const colour = getGradeColor(row.expected_grade, row.lang_stream ?? undefined);
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="px-1.5 py-0.5 rounded text-[11px] font-semibold"
        style={{ backgroundColor: `${colour}22`, color: colour }}
      >
        {row.expected_grade}{stream}
      </span>
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
    <table className="w-full text-xs">
      <thead className={thead}>
        <tr className={theadRow}>
          <th className={th}>{label}</th>
          <th className={thNum}>Cohort</th>
          <th className={thNum}>Applied</th>
          <th className={thNum}>Not returning</th>
          <th className={thNum}>No response</th>
          {/* Of the unresponsive, not of everybody: under a "no response"
              heading a cohort-wide figure reads as this one anyway. */}
          <th className={thNum} title="Of those with no response, how many have already been called">
            Called
          </th>
          <th className={thNum}>Apply %</th>
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

export function RegularRetentionBreakdowns({ data }: { data: RegularRetentionResponse }) {
  return (
    <div className="space-y-6">
      <Section title="By branch" hint="Where the cohort studied last year.">
        <AxisTable rows={data.by_branch} label="Branch" />
      </Section>

      <Section
        title="By entering grade"
        hint="The grade each student moves into this September, not the one on their record today."
      >
        <AxisTable rows={data.by_expected_grade} label="Entering" />
      </Section>

      <Section
        title="By where they came from"
        hint="Students in both last year's regular course and this summer are the ones most likely to stay."
      >
        <AxisTable
          rows={data.by_source}
          label="Source"
          renderKey={(key) => (
            <span title={SOURCE_HINTS[key as RetentionSource] ?? ""}>
              {SOURCE_LABELS[key as RetentionSource] ?? key}
            </span>
          )}
        />
      </Section>

      <Section title="By tutor" hint="Whose students have and haven't come back.">
        <AxisTable rows={data.by_tutor} label="Tutor" />
      </Section>

      <Section
        title="Why they are not returning"
        hint="Reasons recorded against families who told us they are leaving. These feed the quarterly termination report too."
      >
        <table className="w-full text-xs">
          <thead className={thead}>
            <tr className={theadRow}>
              <th className={th}>Reason</th>
              <th className={thNum}>Students</th>
              <th className={thNum}>Share</th>
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
                Recorded, but not counted as a student we lost.
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
 *  the picker, and one note that is true of all of them. */
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
  const { user } = useAuth();
  const [tutorId, setTutorId] = useState<number | null>(null);
  const [when, setWhen] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<string>(CONTACT_METHODS[0]);
  const [type, setType] = useState<string>("General");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whoever is logged in did the calling, so their own name is the default.
  // An admin who is not on the tutor list picks somebody, rather than the
  // records landing on nobody.
  useEffect(() => {
    if (tutorId === null && tutors.length) {
      setTutorId(tutors.find((t) => t.tutor_name === user?.name)?.id ?? null);
    }
  }, [tutors, user?.name, tutorId]);

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
              className={cn(selectClass, "w-full")}
            >
              <option value="">Choose a name</option>
              {tutors.map((t) => (
                <option key={t.id} value={t.id}>{t.tutor_name}</option>
              ))}
            </select>
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

// Working a 500-name list takes more than one sitting, and losing your filters
// to a tab switch means finding your place again. Session storage rather than
// the URL: it survives a refresh without the Suspense boundary a search-param
// hook would force on this page.
const FILTER_STORE_KEY = "regular-retention-chase-filters";

function loadFilters(): ChaseFilters {
  if (typeof window === "undefined") return EMPTY_CHASE_FILTERS;
  try {
    const raw = window.sessionStorage.getItem(FILTER_STORE_KEY);
    return raw ? { ...EMPTY_CHASE_FILTERS, ...JSON.parse(raw) } : EMPTY_CHASE_FILTERS;
  } catch {
    return EMPTY_CHASE_FILTERS;
  }
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
  const [restored, setRestored] = useState(false);
  const [sortKey, setSortKey] = useState<ChaseSortKey | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [contactFor, setContactFor] = useState<RegularRetentionChaseRow | null>(null);
  const [declineFor, setDeclineFor] = useState<RegularRetentionChaseRow | null>(null);
  const [undoFor, setUndoFor] = useState<RegularRetentionChaseRow | null>(null);
  // Ticked rows survive a filter change, because narrowing the list is how you
  // build a selection: filter to F2, tick them, filter to F3, tick those.
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [logged, setLogged] = useState<number | null>(null);

  // Read on mount rather than in useState, so the server and first client
  // render agree and hydration stays quiet.
  useEffect(() => {
    setFilters(loadFilters());
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      window.sessionStorage.setItem(FILTER_STORE_KEY, JSON.stringify(filters));
    } catch {
      // A full or blocked store is not worth failing the page over.
    }
  }, [filters, restored]);

  const set = <K extends keyof ChaseFilters>(key: K, value: ChaseFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const options = useMemo(() => {
    const branches = new Set<string>();
    const grades = new Set<string>();
    const tutors = new Set<string>();
    for (const r of data.chase) {
      if (r.branch) branches.add(r.branch);
      if (r.expected_grade) grades.add(r.expected_grade);
      if (r.tutor_name) tutors.add(r.tutor_name);
    }
    return {
      branches: [...branches].sort(),
      grades: [...grades].sort(),
      tutors: [...tutors].sort(),
    };
  }, [data.chase]);

  const rows = useMemo(
    () => sortChaseRows(filterChaseRows(data.chase, filters, today), sortKey, dir),
    [data.chase, filters, sortKey, dir, today]
  );

  const dueCount = useMemo(
    () => data.chase.filter((r) => isFollowUpDue(r, today)).length,
    [data.chase, today]
  );

  // Counted over the unresponsive only: a family who already applied does not
  // need ringing, so a missing number is not work.
  const noPhoneCount = useMemo(
    () => data.chase.filter((r) => r.state === "no_response" && !hasPhone(r)).length,
    [data.chase]
  );

  const filtersActive =
    JSON.stringify(filters) !== JSON.stringify(EMPTY_CHASE_FILTERS);

  // The selection is a set of ids, but the dialog wants the rows behind them,
  // and only rows that still exist in the report.
  const pickedRows = useMemo(
    () => data.chase.filter((r) => picked.has(r.student_id)),
    [data.chase, picked]
  );
  const shownPicked = rows.filter((r) => picked.has(r.student_id)).length;
  const allShownPicked = rows.length > 0 && shownPicked === rows.length;

  const togglePicked = (studentId: number) => {
    setLogged(null);
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(studentId)) next.add(studentId);
      return next;
    });
  };

  /** Ticks or clears every row currently on screen, leaving anything picked
   *  under an earlier filter alone. */
  const toggleAllShown = () => {
    setLogged(null);
    setPicked((current) => {
      const next = new Set(current);
      for (const r of rows) {
        if (allShownPicked) next.delete(r.student_id);
        else next.add(r.student_id);
      }
      return next;
    });
  };

  const onSort = (k: ChaseSortKey) => {
    if (sortKey === k) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      // Staleness is the call queue, so it opens with the most overdue first.
      setDir(k === "days_since_contact" ? "desc" : "asc");
    }
  };

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

  const SortHeader = ({ k, children }: { k: ChaseSortKey; children: React.ReactNode }) => {
    const active = sortKey === k;
    const Arrow = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
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
    <div className="flex flex-col min-h-0 flex-1">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Name, code or phone"
            className={cn(selectClass, "pl-8 w-52")}
          />
        </div>
        <select
          value={filters.state}
          onChange={(e) => set("state", e.target.value as RetentionState | "all")}
          className={selectClass}
        >
          <option value="no_response">No response</option>
          <option value="applied">Applied</option>
          <option value="enrolled">Enrolled</option>
          <option value="declined">Not returning</option>
          <option value="not_churn">Accounted for</option>
          <option value="all">Everyone</option>
        </select>
        {options.tutors.length > 1 && (
          <select value={filters.tutor} onChange={(e) => set("tutor", e.target.value)} className={selectClass}>
            <option value="">All tutors</option>
            {options.tutors.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {options.branches.length > 1 && (
          <select value={filters.branch} onChange={(e) => set("branch", e.target.value)} className={selectClass}>
            <option value="">All branches</option>
            {options.branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        <select value={filters.grade} onChange={(e) => set("grade", e.target.value)} className={selectClass}>
          <option value="">All grades</option>
          {options.grades.map((g) => <option key={g} value={g}>Entering {g}</option>)}
        </select>
        <select value={filters.source} onChange={(e) => set("source", e.target.value)} className={selectClass}>
          <option value="">Any source</option>
          {(Object.keys(SOURCE_LABELS) as RetentionSource[]).map((s) => (
            <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
          ))}
        </select>
        <select
          value={filters.contact}
          onChange={(e) => set("contact", e.target.value as ChaseFilters["contact"])}
          className={selectClass}
        >
          <option value="">Any contact status</option>
          <option value="no">Never contacted</option>
          <option value="yes">Contacted before</option>
          <option value="due">Follow-up due{dueCount ? ` (${dueCount})` : ""}</option>
          <option value="nophone">No phone number{noPhoneCount ? ` (${noPhoneCount})` : ""}</option>
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

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {rows.length} of {data.chase.length}
          </span>
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

      {/* What the ticks can do. Only here when something is ticked, so the
          toolbar above stays the same height while working normally. */}
      {!isReadOnly && picked.size > 0 && (
        <div className="flex items-center gap-3 mb-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium text-foreground tabular-nums">
            {picked.size} selected
            {shownPicked < picked.size && (
              <span className="text-muted-foreground font-normal">
                {" "}({picked.size - shownPicked} not in this view)
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            disabled={picked.size > BULK_CONTACT_LIMIT}
            className={cn(
              selectClass,
              "inline-flex items-center gap-1.5 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Log a contact
          </button>
          {picked.size > BULK_CONTACT_LIMIT && (
            <span className="text-xs text-amber-700 dark:text-amber-400">
              A contact can be logged for {BULK_CONTACT_LIMIT} students at a time.
            </span>
          )}
          <button
            type="button"
            onClick={() => setPicked(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Said once, where the ticks were, rather than as a toast that is gone
          before the list finishes reloading. */}
      {logged !== null && (
        <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-3">
          Contact logged for {logged} student{logged === 1 ? "" : "s"}.
        </p>
      )}

      {/* Table */}
      <div className={cn(wrap, "flex-1 min-h-0 overflow-auto")}>
        <table className="w-full text-xs">
          <thead className={cn(thead, "sticky top-0 z-10")}>
            <tr className={theadRow}>
              {!isReadOnly && (
                <th className={cn(th, "w-8")}>
                  <input
                    type="checkbox"
                    checked={allShownPicked}
                    onChange={toggleAllShown}
                    disabled={rows.length === 0}
                    aria-label={allShownPicked ? "Clear every row shown" : "Select every row shown"}
                    title={allShownPicked ? "Clear every row shown" : "Select every row shown"}
                  />
                </th>
              )}
              <SortHeader k="student_code">Code</SortHeader>
              <SortHeader k="student_name">Student</SortHeader>
              <SortHeader k="expected_grade">Entering</SortHeader>
              <SortHeader k="branch">Branch</SortHeader>
              <SortHeader k="tutor_name">Tutor</SortHeader>
              <th className={th}>Phone</th>
              <SortHeader k="days_since_contact">Last contacted</SortHeader>
              <th className={th}>State</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody className={rowDivide}>
            {rows.length === 0 ? (
              <EmptyRow span={isReadOnly ? 9 : 10}>Nobody matches these filters.</EmptyRow>
            ) : (
              rows.map((r) => {
                const due = isFollowUpDue(r, today);
                return (
                  <tr key={r.student_id} className="hover:bg-[#f0e6d8]/30 dark:hover:bg-[#2a2520]/50">
                    {!isReadOnly && (
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={picked.has(r.student_id)}
                          onChange={() => togglePicked(r.student_id)}
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
                      <StudentLink row={r} className="text-foreground font-medium" />
                      {r.on_prospect_board && (
                        <span
                          role="img"
                          aria-label="Already being followed up by a primary branch"
                          className="ml-1.5 text-[10px] text-sky-700 dark:text-sky-400 align-middle"
                          title="A primary branch is already following this family up on the prospect board"
                        >
                          ◆
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap"><GradeBadge row={r} /></td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.branch ?? "-"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{r.tutor_name ?? "-"}</td>
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
                      {r.decline_reason_category && r.state !== "declined" && (
                        <span
                          className="ml-1.5 text-[10px] text-rose-600 dark:text-rose-400"
                          title="This family was marked as not returning but has a live application — worth checking"
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
                            onClick={() => setContactFor(r)}
                            title="Log a contact with this family"
                            className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary"
                          >
                            <MessageSquarePlus className="h-3.5 w-3.5" />
                          </button>
                          {isRecordedAsLeaving(r.state) ? (
                            <button
                              type="button"
                              onClick={() => setUndoFor(r)}
                              title="Put this student back on the list"
                              className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary"
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeclineFor(r)}
                              title="Mark this family as not returning"
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

      {contactFor && (
        <RecordContactModal
          isOpen
          onClose={(saved) => {
            setContactFor(null);
            if (saved) onChanged();
          }}
          editingContact={null}
          preselectedStudentId={contactFor.student_id}
        />
      )}

      {bulkOpen && (
        <BulkContactDialog
          rows={pickedRows}
          currentUserEmail={currentUserEmail}
          onClose={(count) => {
            setBulkOpen(false);
            if (count > 0) {
              setLogged(count);
              setPicked(new Set());
              onChanged();
            }
          }}
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
