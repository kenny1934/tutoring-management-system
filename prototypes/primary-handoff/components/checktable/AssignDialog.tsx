"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  FileText,
  Check,
  Printer,
  CalendarClock,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import type {
  AssignTarget,
  AssignmentStatus,
  ChecktableAssignment,
  ChecktableItem,
  Session,
  Student,
} from "@/lib/types";
import { mcDriveViewerUrl } from "@/lib/mc-drive";

type Props = {
  item: ChecktableItem;
  basePath: string;
  onClose: () => void;
  onAssign: (input: {
    pageRange?: string;
    tutorNote?: string;
    sessionLabel: string;
    sessionId?: string;
  }) => void;

  // --- Student flow (per-student checktable). Omit `student` for the
  //     Courseware page's student-less assign flow. ---
  student?: Student;
  existingAssignment?: ChecktableAssignment;
  upcomingSessions?: Session[];
  /** How many assigned-not-done items the student currently has across all
   *  checktables — used for the low-HW-load warning. */
  openAssignmentCount?: number;
  formatSessionLabel?: (sessionId: string) => string;
  onMarkDone?: () => void;
  onUnassign?: () => void;
  onAddToPrintBatch?: () => void;
  isInPrintBatch?: boolean;

  // --- Courseware flow: pick which session (and therefore which student) to
  //     assign to. Active when `student` is not provided. ---
  assignTargets?: AssignTarget[];
};

const UNLINKED = "__none__";

export function AssignDialog({
  item,
  student,
  basePath,
  existingAssignment,
  upcomingSessions = [],
  openAssignmentCount = 0,
  formatSessionLabel,
  onClose,
  onAssign,
  onMarkDone,
  onUnassign,
  onAddToPrintBatch,
  isInPrintBatch,
  assignTargets,
}: Props) {
  // Courseware mode = no fixed student; the session picker chooses one.
  const courseware = !student;

  const [pageRange, setPageRange] = useState(
    existingAssignment?.pageRange ?? ""
  );
  const [tutorNote, setTutorNote] = useState(
    existingAssignment?.tutorNote ?? ""
  );
  const [sessionId, setSessionId] = useState<string>(
    existingAssignment?.sessionId ??
      (courseware
        ? assignTargets?.[0]?.sessionId ?? UNLINKED
        : upcomingSessions[0]?.id ?? UNLINKED)
  );

  const pickedTarget = useMemo(
    () => assignTargets?.find((t) => t.sessionId === sessionId),
    [assignTargets, sessionId]
  );

  const sessionLabel = useMemo(() => {
    if (sessionId === UNLINKED) return "";
    if (courseware) return pickedTarget?.label ?? "";
    return formatSessionLabel ? formatSessionLabel(sessionId) : "";
  }, [sessionId, courseware, pickedTarget, formatSessionLabel]);

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
    !!student &&
    student.hwLoad === "Little" &&
    status !== "done" &&
    projectedOpen >= 3;

  // In courseware mode a session must be chosen (it identifies the student).
  const canAssign = !courseware || sessionId !== UNLINKED;

  const submitAssign = () => {
    if (!canAssign) return;
    onAssign({
      pageRange,
      tutorNote,
      sessionLabel,
      sessionId: sessionId === UNLINKED ? undefined : sessionId,
    });
  };

  const previewUrl = item.mcDriveS3Path
    ? mcDriveViewerUrl(item.mcDriveS3Path)
    : null;

  const subtitle = courseware
    ? pickedTarget
      ? `Assigning to ${pickedTarget.studentName}`
      : "Pick a session to assign this worksheet"
    : `${student!.name} · ${student!.code} · ${student!.hwLoad} HW`;

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
                <span className="text-xs rounded-md bg-amber-100 text-amber-800 px-2 py-0.5">
                  Assigned
                </span>
              )}
            </div>
            <div className="text-xs text-ink-500 mt-0.5 truncate">
              {subtitle}
              {!courseware && (
                <span className="ml-2 text-ink-400">
                  {openAssignmentCount} open
                </span>
              )}
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
              <span className="font-medium">Heads up:</span> {student!.name}{" "}
              prefers a light homework load.{" "}
              {status === null
                ? `Assigning this would bring them to ${projectedOpen} open items.`
                : `They already have ${projectedOpen} open items.`}
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-5 gap-0">
          <div className="sm:col-span-3 border-r border-ink-100 p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-ink-500">Preview</div>
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-800"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open in new tab
                </a>
              )}
            </div>
            <div className="aspect-[3/4] surface-muted overflow-hidden">
              {previewUrl ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-full border-0 bg-white"
                  title={`Preview of ${item.code}`}
                  loading="lazy"
                />
              ) : (
                <div className="grid place-items-center h-full text-ink-400">
                  <div className="text-center px-4">
                    <FileText className="h-10 w-10 mx-auto mb-2 text-ink-300" />
                    <div className="text-sm">PDF preview would render here</div>
                    <div className="text-xs mt-1 break-all font-mono text-ink-500">
                      {item.pdfPath ?? `${basePath}\\${item.code}.pdf`}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="sm:col-span-2 p-5 space-y-4">
            <div>
              <label className="block text-xs text-ink-500 mb-1">
                {courseware ? "Assign to session" : "Session"}
              </label>
              {courseware ? (
                (assignTargets?.length ?? 0) > 0 ? (
                  <select
                    value={sessionId}
                    onChange={(e) => setSessionId(e.target.value)}
                    className="w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-ink-400"
                  >
                    {assignTargets!.map((t) => (
                      <option key={t.sessionId} value={t.sessionId}>
                        {t.studentName} · {t.label} · {t.tutorName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-md border border-dashed border-ink-200 px-3 py-2 text-xs text-ink-500 bg-ink-50">
                    No upcoming sessions to assign to.
                  </div>
                )
              ) : upcomingSessions.length > 0 ? (
                <select
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  className="w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-ink-400"
                >
                  {upcomingSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatSessionLabel ? formatSessionLabel(s.id) : s.id} ·{" "}
                      {s.tutor_name}
                    </option>
                  ))}
                  <option value={UNLINKED}>Assign without a session</option>
                </select>
              ) : (
                <div className="rounded-md border border-dashed border-ink-200 px-3 py-2 text-xs text-ink-500 bg-ink-50">
                  No upcoming sessions for {student!.name}. Assignment will be
                  recorded without a session link.
                </div>
              )}
              <p className="text-xs text-ink-400 mt-1 flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                {courseware
                  ? "The chosen session determines the student."
                  : "Picker is restricted to this student's upcoming sessions."}
              </p>
            </div>

            <div>
              <label className="block text-xs text-ink-500 mb-1">
                Page range
              </label>
              <input
                type="text"
                value={pageRange}
                onChange={(e) => setPageRange(e.target.value)}
                placeholder="e.g. 1-2, or leave blank for full"
                className="w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:outline-none focus:border-ink-400"
              />
            </div>

            <div>
              <label className="block text-xs text-ink-500 mb-1">
                Tutor note
              </label>
              <textarea
                value={tutorNote}
                onChange={(e) => setTutorNote(e.target.value)}
                rows={3}
                placeholder="Anything to flag for this student"
                className="w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:outline-none focus:border-ink-400 resize-none"
              />
            </div>

            {existingAssignment?.assignedAt && (
              <div className="text-xs text-ink-500 border-t border-ink-100 pt-3">
                Assigned{" "}
                {new Date(existingAssignment.assignedAt).toLocaleDateString()}
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

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 px-5 py-3 bg-white sticky bottom-0">
          <div className="flex flex-wrap gap-2">
            {status === null && (
              <button
                onClick={submitAssign}
                disabled={!canAssign}
                className="rounded-md bg-ink-800 text-white px-3 py-1.5 text-sm font-medium hover:bg-ink-900 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Assign{sessionId !== UNLINKED ? " to session" : ""}
              </button>
            )}
            {status === "assigned" && (
              <>
                {onMarkDone && (
                  <button
                    onClick={onMarkDone}
                    className="rounded-md bg-good text-white px-3 py-1.5 text-sm font-medium hover:opacity-90 flex items-center gap-1"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    Mark done
                  </button>
                )}
                <button
                  onClick={submitAssign}
                  className="rounded-md border border-ink-300 text-ink-700 px-3 py-1.5 text-sm hover:bg-ink-50"
                >
                  Update
                </button>
                {onUnassign && (
                  <button
                    onClick={onUnassign}
                    className="rounded-md text-bad px-3 py-1.5 text-sm hover:bg-ink-50"
                  >
                    Unassign
                  </button>
                )}
              </>
            )}
            {status === "done" && onUnassign && (
              <button
                onClick={onUnassign}
                className="rounded-md text-bad px-3 py-1.5 text-sm hover:bg-ink-50"
              >
                Remove from record
              </button>
            )}
          </div>
          {onAddToPrintBatch && (
            <button
              onClick={onAddToPrintBatch}
              className={`rounded-md px-3 py-1.5 text-sm font-medium flex items-center gap-1 ${
                isInPrintBatch
                  ? "bg-ink-800 text-white"
                  : "border border-ink-300 text-ink-700 hover:bg-ink-50"
              }`}
            >
              <Printer className="h-3.5 w-3.5" />
              {isInPrintBatch ? "In print batch" : "Add to print batch"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
