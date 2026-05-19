"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  FileText,
  Check,
  Printer,
  CalendarClock,
  AlertTriangle,
} from "lucide-react";
import type {
  AssignmentStatus,
  ChecktableAssignment,
  ChecktableItem,
  Session,
  Student,
} from "@/lib/types";

type Props = {
  item: ChecktableItem;
  student: Student;
  basePath: string;
  existingAssignment?: ChecktableAssignment;
  upcomingSessions: Session[];
  /** How many assigned-not-done items the student currently has across all
   *  checktables — used for the low-HW-load warning. */
  openAssignmentCount: number;
  formatSessionLabel: (sessionId: string) => string;
  onClose: () => void;
  onAssign: (input: {
    pageRange?: string;
    tutorNote?: string;
    sessionLabel: string;
    sessionId?: string;
  }) => void;
  onMarkDone: () => void;
  onUnassign: () => void;
  onAddToPrintBatch: () => void;
  isInPrintBatch: boolean;
};

const UNLINKED = "__none__";

export function AssignDialog({
  item,
  student,
  basePath,
  existingAssignment,
  upcomingSessions,
  openAssignmentCount,
  formatSessionLabel,
  onClose,
  onAssign,
  onMarkDone,
  onUnassign,
  onAddToPrintBatch,
  isInPrintBatch,
}: Props) {
  const [pageRange, setPageRange] = useState(
    existingAssignment?.pageRange ?? ""
  );
  const [tutorNote, setTutorNote] = useState(
    existingAssignment?.tutorNote ?? ""
  );
  const [sessionId, setSessionId] = useState<string>(
    existingAssignment?.sessionId ??
      upcomingSessions[0]?.id ??
      UNLINKED
  );

  const sessionLabel = useMemo(() => {
    if (sessionId === UNLINKED) return "";
    return formatSessionLabel(sessionId);
  }, [sessionId, formatSessionLabel]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const status: AssignmentStatus | null = existingAssignment?.status ?? null;

  // Adding a brand-new assignment bumps the open count by 1; updating an
  // already-assigned item keeps it where it is.
  const projectedOpen = openAssignmentCount + (status === null ? 1 : 0);
  const showLowLoadWarning =
    student.hwLoad === "Little" && status !== "done" && projectedOpen >= 3;

  const submitAssign = () =>
    onAssign({
      pageRange,
      tutorNote,
      sessionLabel,
      sessionId: sessionId === UNLINKED ? undefined : sessionId,
    });

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-ink-900/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="surface w-full sm:max-w-3xl bg-white max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-3 sticky top-0 bg-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-ink-900">
                {item.code}
              </span>
              {status === "done" && (
                <span className="text-xs rounded-md bg-good text-white px-2 py-0.5">
                  Done
                </span>
              )}
              {status === "assigned" && (
                <span className="text-xs rounded-md bg-accent-100 text-accent-700 px-2 py-0.5">
                  Assigned
                </span>
              )}
            </div>
            <div className="text-xs text-ink-500 mt-0.5 truncate">
              {student.name} · {student.code} · HW load:{" "}
              <span
                className="rounded-md px-1.5 py-0.5 bg-ink-100 text-ink-700"
                data-hw-load={student.hwLoad}
              >
                {student.hwLoad}
              </span>
              <span className="ml-2 text-ink-400">
                Open assignments: {openAssignmentCount}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 -mr-2 p-2"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {showLowLoadWarning && (
          <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
            <div>
              <span className="font-medium">Heads up:</span> {student.name}{" "}
              prefers a light homework load (
              <span data-hw-load={student.hwLoad}>{student.hwLoad}</span>
              ).{" "}
              {status === null
                ? `Assigning this would bring them to ${projectedOpen} open items.`
                : `They already have ${projectedOpen} open items.`}
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-5 gap-0">
          {/* PDF preview placeholder */}
          <div className="sm:col-span-3 border-r border-ink-100 p-5">
            <div className="text-xs uppercase tracking-wide text-ink-500 mb-2">
              Preview
            </div>
            <div className="aspect-[3/4] surface-muted grid place-items-center text-ink-400">
              <div className="text-center px-4">
                <FileText className="h-10 w-10 mx-auto mb-2 text-ink-300" />
                <div className="text-sm">PDF preview would render here</div>
                <div className="text-xs mt-1 break-all font-mono text-ink-500">
                  {item.pdfPath ?? `${basePath}\\${item.code}.pdf`}
                </div>
              </div>
            </div>
          </div>

          {/* Assign form */}
          <div className="sm:col-span-2 p-5 space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-500 mb-1">
                Session
              </label>
              {upcomingSessions.length > 0 ? (
                <select
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  className="w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-accent-500"
                >
                  {upcomingSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatSessionLabel(s.id)} · {s.tutor_name}
                    </option>
                  ))}
                  <option value={UNLINKED}>
                    — Assign without a session —
                  </option>
                </select>
              ) : (
                <div className="rounded-md border border-dashed border-ink-200 px-3 py-2 text-xs text-ink-500 bg-ink-50">
                  No upcoming sessions for {student.name}. Assignment will be
                  recorded without a session link.
                </div>
              )}
              <p className="text-xs text-ink-400 mt-1 flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                Picker is restricted to this student's upcoming sessions.
              </p>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-500 mb-1">
                Page range
              </label>
              <input
                type="text"
                value={pageRange}
                onChange={(e) => setPageRange(e.target.value)}
                placeholder="e.g. 1-2, or leave blank for full"
                className="w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:outline-none focus:border-accent-500"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-500 mb-1">
                Tutor note
              </label>
              <textarea
                value={tutorNote}
                onChange={(e) => setTutorNote(e.target.value)}
                rows={3}
                placeholder="Anything to flag for this student"
                className="w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:outline-none focus:border-accent-500 resize-none"
              />
            </div>

            {existingAssignment?.assignedAt && (
              <div className="text-xs text-ink-500 border-t border-ink-100 pt-3">
                Assigned {new Date(existingAssignment.assignedAt).toLocaleDateString()}
                {existingAssignment.doneAt && (
                  <>
                    {" · "}done{" "}
                    {new Date(existingAssignment.doneAt).toLocaleDateString()}
                  </>
                )}
                {existingAssignment.sourceRecordedExerciseId && (
                  <span className="ml-1 italic">· recorded in session</span>
                )}
              </div>
            )}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 px-5 py-3 bg-ink-50 sticky bottom-0">
          <div className="flex flex-wrap gap-2">
            {status === null && (
              <button
                onClick={submitAssign}
                className="rounded-md bg-accent-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-accent-700"
              >
                Assign{sessionId !== UNLINKED ? " to session" : ""}
              </button>
            )}
            {status === "assigned" && (
              <>
                <button
                  onClick={onMarkDone}
                  className="rounded-md bg-good text-white px-3 py-1.5 text-sm font-medium hover:opacity-90 flex items-center gap-1"
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  Mark done
                </button>
                <button
                  onClick={submitAssign}
                  className="rounded-md border border-ink-300 text-ink-700 px-3 py-1.5 text-sm hover:bg-white"
                >
                  Update
                </button>
                <button
                  onClick={onUnassign}
                  className="rounded-md text-bad px-3 py-1.5 text-sm hover:bg-white"
                >
                  Unassign
                </button>
              </>
            )}
            {status === "done" && (
              <button
                onClick={onUnassign}
                className="rounded-md text-bad px-3 py-1.5 text-sm hover:bg-white"
              >
                Remove from record
              </button>
            )}
          </div>
          <button
            onClick={onAddToPrintBatch}
            className={`rounded-md px-3 py-1.5 text-sm font-medium flex items-center gap-1 ${
              isInPrintBatch
                ? "bg-ink-800 text-white"
                : "border border-ink-300 text-ink-700 hover:bg-white"
            }`}
          >
            <Printer className="h-3.5 w-3.5" />
            {isInPrintBatch ? "In print batch" : "Add to print batch"}
          </button>
        </footer>
      </div>
    </div>
  );
}
