"use client";

import { useMemo, useState } from "react";
import { useModalA11y } from "@/lib/useModalA11y";
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
  ExerciseKind,
  Session,
  Student,
} from "@/lib/types";
import { mcDriveViewerUrl } from "@/lib/mc-drive";

export type SessionPick = {
  sessionId: string;
  studentId: string;
  kind: ExerciseKind;
};

type Props = {
  item: ChecktableItem;
  basePath: string;
  onClose: () => void;

  // --- Student flow (per-student checktable). Provide `student` + `onAssign`. ---
  student?: Student;
  existingAssignment?: ChecktableAssignment;
  upcomingSessions?: Session[];
  /** How many assigned-not-done items the student currently has across all
   *  checktables — used for the low-HW-load warning. */
  openAssignmentCount?: number;
  formatSessionLabel?: (sessionId: string) => string;
  onAssign?: (input: {
    pageRange?: string;
    tutorNote?: string;
    sessionLabel: string;
    sessionId?: string;
    kind?: ExerciseKind;
  }) => void;
  onMarkDone?: () => void;
  onUnassign?: () => void;
  onAddToPrintBatch?: () => void;
  isInPrintBatch?: boolean;

  // --- Courseware flow (student-less): pick one or more sessions, each tagged
  //     CW or HW. Active when `student` is not provided. ---
  assignTargets?: AssignTarget[];
  onAssignSessions?: (
    picks: SessionPick[],
    opts: { pageRange?: string; tutorNote?: string }
  ) => void;
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
  assignTargets = [],
  onAssignSessions,
}: Props) {
  // Courseware mode = no fixed student; a multi-select session picker chooses
  // which sessions (and therefore students) get the worksheet.
  const courseware = !student;

  const initialPageRange = existingAssignment?.pageRange ?? "";
  const initialTutorNote = existingAssignment?.tutorNote ?? "";
  const initialSessionId =
    existingAssignment?.sessionId ?? upcomingSessions[0]?.id ?? UNLINKED;

  const [pageRange, setPageRange] = useState(initialPageRange);
  const [tutorNote, setTutorNote] = useState(initialTutorNote);

  // Student-mode single session link.
  const [sessionId, setSessionId] = useState<string>(initialSessionId);
  // Student-mode CW/HW choice — only matters when a session is linked.
  const [studentKind, setStudentKind] = useState<ExerciseKind>("HW");

  // Courseware-mode multi-select: sessionId -> CW/HW. `defaultKind` is applied
  // to newly-checked rows; each row can be flipped individually.
  const [defaultKind, setDefaultKind] = useState<ExerciseKind>("HW");
  const [picks, setPicks] = useState<Map<string, ExerciseKind>>(new Map());

  const targetById = useMemo(
    () => new Map(assignTargets.map((t) => [t.sessionId, t])),
    [assignTargets]
  );
  const groupedTargets = useMemo(() => {
    const groups: { date: string; dateLabel: string; rows: AssignTarget[] }[] =
      [];
    for (const t of assignTargets) {
      let g = groups[groups.length - 1];
      if (!g || g.date !== t.date) {
        g = { date: t.date, dateLabel: t.dateLabel, rows: [] };
        groups.push(g);
      }
      g.rows.push(t);
    }
    return groups;
  }, [assignTargets]);

  // Pristine = no edits worth guarding; controls backdrop close.
  const dirty =
    pageRange !== initialPageRange ||
    tutorNote !== initialTutorNote ||
    sessionId !== initialSessionId ||
    studentKind !== "HW" ||
    picks.size > 0 ||
    defaultKind !== "HW";

  const { dialogRef, onKeyDownTrap, onBackdropClick } = useModalA11y({
    onClose,
    isPristine: !dirty,
  });

  const status: AssignmentStatus | null = existingAssignment?.status ?? null;
  const projectedOpen = openAssignmentCount + (status === null ? 1 : 0);
  const showLowLoadWarning =
    !!student &&
    student.hwLoad === "Little" &&
    status !== "done" &&
    projectedOpen >= 3;

  const sessionLabel = useMemo(() => {
    if (sessionId === UNLINKED) return "";
    return formatSessionLabel ? formatSessionLabel(sessionId) : "";
  }, [sessionId, formatSessionLabel]);

  const linked = sessionId !== UNLINKED;
  const submitAssign = () =>
    onAssign?.({
      pageRange,
      tutorNote,
      sessionLabel,
      sessionId: linked ? sessionId : undefined,
      kind: linked ? studentKind : undefined,
    });

  const togglePick = (t: AssignTarget) =>
    setPicks((prev) => {
      const next = new Map(prev);
      if (next.has(t.sessionId)) next.delete(t.sessionId);
      else next.set(t.sessionId, defaultKind);
      return next;
    });
  const setRowKind = (sessionId: string, kind: ExerciseKind) =>
    setPicks((prev) => {
      if (!prev.has(sessionId)) return prev;
      const next = new Map(prev);
      next.set(sessionId, kind);
      return next;
    });

  const submitSessions = () => {
    if (!onAssignSessions || picks.size === 0) return;
    const list: SessionPick[] = [...picks.entries()].map(
      ([sid, kind]) => ({
        sessionId: sid,
        studentId: targetById.get(sid)?.studentId ?? "",
        kind,
      })
    );
    onAssignSessions(list, { pageRange, tutorNote });
  };

  const previewUrl = item.mcDriveS3Path
    ? mcDriveViewerUrl(item.mcDriveS3Path)
    : null;

  const subtitle = courseware
    ? picks.size > 0
      ? `${picks.size} session${picks.size === 1 ? "" : "s"} selected`
      : "Pick the sessions to assign this worksheet to"
    : `${student!.name} · ${student!.code} · ${student!.hwLoad} HW`;

  const previewSpan = courseware ? "sm:col-span-2" : "sm:col-span-3";
  const controlSpan = courseware ? "sm:col-span-3" : "sm:col-span-2";

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-ink-900/40 p-0 sm:p-4"
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-dialog-title"
        tabIndex={-1}
        onKeyDown={onKeyDownTrap}
        className="surface w-full sm:max-w-3xl bg-white max-h-[92vh] overflow-y-auto outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-3 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                id="assign-dialog-title"
                className="text-lg font-semibold text-ink-900"
              >
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
          <div className={`${previewSpan} border-r border-ink-100 p-5`}>
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
                // The MC Drive viewer renders the page a touch wider than this
                // narrow frame (and ignores #zoom). Render the iframe at 125%
                // and scale it back to 80% so the viewer gets the extra width
                // and the whole page shrinks to fit — no stray horizontal scroll.
                <div
                  className="origin-top-left"
                  style={{
                    width: "125%",
                    height: "125%",
                    transform: "scale(0.8)",
                  }}
                >
                  <iframe
                    src={`${previewUrl}#zoom=page-fit`}
                    className="block w-full h-full border-0 bg-white"
                    title={`Preview of ${item.code}`}
                    loading="lazy"
                  />
                </div>
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

          <div className={`${controlSpan} p-5 space-y-4`}>
            {courseware ? (
              <CoursewarePicker
                groups={groupedTargets}
                picks={picks}
                defaultKind={defaultKind}
                onDefaultKind={setDefaultKind}
                onToggle={togglePick}
                onRowKind={setRowKind}
                pageRange={pageRange}
                onPageRange={setPageRange}
                tutorNote={tutorNote}
                onTutorNote={setTutorNote}
              />
            ) : (
              <StudentControls
                student={student!}
                upcomingSessions={upcomingSessions}
                sessionId={sessionId}
                onSessionId={setSessionId}
                formatSessionLabel={formatSessionLabel}
                kind={studentKind}
                onKind={setStudentKind}
                showKind={linked && status === null}
                pageRange={pageRange}
                onPageRange={setPageRange}
                tutorNote={tutorNote}
                onTutorNote={setTutorNote}
                existingAssignment={existingAssignment}
              />
            )}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 px-5 py-3 bg-white sticky bottom-0">
          {courseware ? (
            <button
              onClick={submitSessions}
              disabled={picks.size === 0}
              className="rounded-md bg-mc-red-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-mc-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {picks.size === 0
                ? "Select sessions to assign"
                : `Assign to ${picks.size} session${picks.size === 1 ? "" : "s"}`}
            </button>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {status === null && (
                  <button
                    onClick={submitAssign}
                    className="rounded-md bg-mc-red-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-mc-red-700"
                  >
                    {linked ? `Add ${studentKind} to session` : "Assign"}
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
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

// --- Courseware session multi-select ---------------------------------------

function KindBadge({
  kind,
  onToggle,
}: {
  kind: ExerciseKind;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggle();
      }}
      title="Toggle classwork / homework"
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        kind === "CW"
          ? "bg-mc-red-100 text-mc-red-700"
          : "bg-blue-100 text-blue-700"
      }`}
    >
      {kind}
    </button>
  );
}

function CoursewarePicker({
  groups,
  picks,
  defaultKind,
  onDefaultKind,
  onToggle,
  onRowKind,
  pageRange,
  onPageRange,
  tutorNote,
  onTutorNote,
}: {
  groups: { date: string; dateLabel: string; rows: AssignTarget[] }[];
  picks: Map<string, ExerciseKind>;
  defaultKind: ExerciseKind;
  onDefaultKind: (k: ExerciseKind) => void;
  onToggle: (t: AssignTarget) => void;
  onRowKind: (sessionId: string, kind: ExerciseKind) => void;
  pageRange: string;
  onPageRange: (v: string) => void;
  tutorNote: string;
  onTutorNote: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs text-ink-500">New picks as</label>
        <div className="inline-flex rounded-md border border-ink-200 bg-white p-0.5 text-xs">
          {(["CW", "HW"] as ExerciseKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onDefaultKind(k)}
              className={`px-2.5 py-0.5 rounded-md font-semibold ${
                defaultKind === k
                  ? k === "CW"
                    ? "bg-mc-red-100 text-mc-red-700"
                    : "bg-blue-100 text-blue-700"
                  : "text-ink-400 hover:bg-ink-100"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-ink-500 mb-1">Page range</label>
          <input
            type="text"
            value={pageRange}
            onChange={(e) => onPageRange(e.target.value)}
            placeholder="e.g. 1-2"
            className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-sm focus:outline-none focus:border-ink-400"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-500 mb-1">Note</label>
          <input
            type="text"
            value={tutorNote}
            onChange={(e) => onTutorNote(e.target.value)}
            placeholder="optional"
            className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-sm focus:outline-none focus:border-ink-400"
          />
        </div>
      </div>

      <div>
        <div className="text-xs text-ink-500 mb-1 flex items-center gap-1">
          <CalendarClock className="h-3 w-3" />
          Upcoming sessions
        </div>
        {groups.length === 0 ? (
          <div className="rounded-md border border-dashed border-ink-200 px-3 py-3 text-xs text-ink-500 bg-ink-50">
            No upcoming sessions to assign to.
          </div>
        ) : (
          <div className="rounded-md border border-ink-200 max-h-72 overflow-y-auto divide-y divide-ink-100">
            {groups.map((g) => (
              <div key={g.date}>
                <div className="sticky top-0 bg-ink-50 px-2.5 py-1 text-[11px] uppercase tracking-wide text-ink-500 font-medium">
                  {g.dateLabel}
                </div>
                {g.rows.map((t) => {
                  const kind = picks.get(t.sessionId);
                  const picked = kind !== undefined;
                  return (
                    <label
                      key={t.sessionId}
                      className="flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-ink-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={picked}
                        onChange={() => onToggle(t)}
                        className="h-3.5 w-3.5 accent-ink-800 shrink-0"
                      />
                      <span className="w-16 shrink-0 text-ink-500 tabular-nums">
                        {t.timeLabel}
                      </span>
                      <span className="flex-1 min-w-0 truncate font-medium text-ink-800">
                        {t.studentName}
                      </span>
                      <span className="truncate text-ink-400 max-w-[84px] hidden sm:block">
                        {t.tutorName}
                      </span>
                      {picked && (
                        <KindBadge
                          kind={kind!}
                          onToggle={() =>
                            onRowKind(t.sessionId, kind === "CW" ? "HW" : "CW")
                          }
                        />
                      )}
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-ink-400 mt-1">
          CW marks the worksheet done in that session; HW assigns it to do.
        </p>
      </div>
    </div>
  );
}

// --- Per-student single-session controls (unchanged behaviour) --------------

function StudentControls({
  student,
  upcomingSessions,
  sessionId,
  onSessionId,
  formatSessionLabel,
  kind,
  onKind,
  showKind,
  pageRange,
  onPageRange,
  tutorNote,
  onTutorNote,
  existingAssignment,
}: {
  student: Student;
  upcomingSessions: Session[];
  sessionId: string;
  onSessionId: (v: string) => void;
  formatSessionLabel?: (sessionId: string) => string;
  kind: ExerciseKind;
  onKind: (k: ExerciseKind) => void;
  showKind: boolean;
  pageRange: string;
  onPageRange: (v: string) => void;
  tutorNote: string;
  onTutorNote: (v: string) => void;
  existingAssignment?: ChecktableAssignment;
}) {
  return (
    <>
      <div>
        <label className="block text-xs text-ink-500 mb-1">Session</label>
        {upcomingSessions.length > 0 ? (
          <select
            value={sessionId}
            onChange={(e) => onSessionId(e.target.value)}
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
            No upcoming sessions for {student.name}. Assignment will be recorded
            without a session link.
          </div>
        )}
        {showKind ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-ink-500">Record as</span>
            <div className="inline-flex rounded-md border border-ink-200 bg-white p-0.5 text-xs">
              {(["CW", "HW"] as ExerciseKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onKind(k)}
                  className={`px-2.5 py-0.5 rounded-md font-semibold ${
                    kind === k
                      ? k === "CW"
                        ? "bg-mc-red-100 text-mc-red-700"
                        : "bg-blue-100 text-blue-700"
                      : "text-ink-400 hover:bg-ink-100"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-400 mt-1 flex items-center gap-1">
            <CalendarClock className="h-3 w-3" />
            Picker is restricted to this student&apos;s upcoming sessions.
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs text-ink-500 mb-1">Page range</label>
        <input
          type="text"
          value={pageRange}
          onChange={(e) => onPageRange(e.target.value)}
          placeholder="e.g. 1-2, or leave blank for full"
          className="w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:outline-none focus:border-ink-400"
        />
      </div>

      <div>
        <label className="block text-xs text-ink-500 mb-1">Tutor note</label>
        <textarea
          value={tutorNote}
          onChange={(e) => onTutorNote(e.target.value)}
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
    </>
  );
}
