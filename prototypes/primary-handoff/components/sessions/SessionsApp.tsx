"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Clock,
  Star,
  CalendarClock,
  Table2,
  Printer,
  Check,
  CircleSlash,
  CircleDashed,
  CheckCircle2,
  UserX,
  Ambulance,
  CloudRain,
  CalendarPlus,
  ChevronDown,
  XCircle,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type {
  Session,
  SessionExercise,
  SessionStatusValue,
  Student,
} from "@/lib/types";
import { SessionStatus } from "@/lib/types";
import {
  usePrimaryStore,
  formatPageRange,
  type NextSuggestion,
  type PendingHomeworkCheck,
  type PendingHomeworkEntry,
} from "@/lib/store/PrimaryStore";
import { DEMO_DAY } from "@/lib/mock-data/sessions";
import { getSessionStatusConfig } from "@/lib/session-status-config";
import { RecordExerciseModal } from "./RecordExerciseModal";
import { MakeupModal } from "./MakeupModal";
import { ChecktableDrawer } from "./ChecktableDrawer";
import {
  SessionsToolbar,
  type StatusFilter,
  type TutorOption,
  type ViewMode,
} from "./SessionsToolbar";
import { WeeklyView } from "./WeeklyView";
import {
  groupByMeeting,
  formatTimeSlot,
  gradeBadgeStyle,
  type ClassMeeting,
} from "./meeting-utils";

type ExerciseEditor = {
  sessionId: string;
  studentId: string;
  kind: "CW" | "HW";
};

type PreviousHwChoice = "complete" | "partial" | "not-done";

export function SessionsApp() {
  const {
    sessions: sessionState,
    students,
    checktables,
    setSessions,
    recordExercise,
    removeExercise,
    recordHomeworkCompletion,
    pendingPreviousHomework,
    primaryChecktableId,
    nextSuggestedItem,
    sessionLabel,
  } = usePrimaryStore();

  const [exerciseEditor, setExerciseEditor] =
    useState<ExerciseEditor | null>(null);
  const [makeupOpen, setMakeupOpen] = useState<{
    sessionId: string;
    studentId: string;
  } | null>(null);
  // Drawer keeps the session row visible underneath so the tutor never
  // loses context while assigning from a checktable. focusItemId is set
  // when arriving via the "Next" pill so the assign dialog opens straight
  // on the suggested item.
  const [drawerOpen, setDrawerOpen] = useState<{
    studentId: string;
    focusItemId?: string;
  } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(DEMO_DAY);
  const [tutorFilter, setTutorFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [view, setView] = useState<ViewMode>("list");

  const searchParams = useSearchParams();
  const highlightSessionId = searchParams.get("session");
  const highlightedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!highlightSessionId) return;
    const target = sessionState.find((s) => s.id === highlightSessionId);
    if (!target) return;
    setSelectedDate(target.session_date);
    setView("list");
  }, [highlightSessionId, sessionState]);

  useEffect(() => {
    if (!highlightSessionId) return;
    if (highlightedRef.current) {
      highlightedRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [highlightSessionId, selectedDate, view]);

  const studentById = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students]
  );

  const nextByStudent = useMemo(() => {
    const map = new Map<string, NextSuggestion | null>();
    for (const s of students) {
      const ctId = primaryChecktableId(s.id);
      map.set(s.id, nextSuggestedItem(s.id, ctId));
    }
    return map;
  }, [students, primaryChecktableId, nextSuggestedItem]);

  /** Per current-session-id, the previous attended session's HW entries
   *  (mix of pending + already-checked-in-this-session). */
  const pendingHwBySessionId = useMemo(() => {
    const map = new Map<string, PendingHomeworkCheck>();
    for (const s of sessionState) {
      const pending = pendingPreviousHomework(s.student_id, s.id);
      if (pending) map.set(s.id, pending);
    }
    return map;
  }, [sessionState, pendingPreviousHomework]);

  // Distinct tutors across all seeded sessions, sorted by surname-ish.
  const tutorOptions = useMemo<TutorOption[]>(() => {
    const map = new Map<string, string>();
    for (const s of sessionState) {
      if (!map.has(s.tutor_id)) map.set(s.tutor_id, s.tutor_name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sessionState]);

  // Distinct statuses present in the seed — keeps the filter dropdown tight
  // and only shows options the user can actually pick.
  const statusOptions = useMemo<SessionStatusValue[]>(() => {
    const set = new Set<SessionStatusValue>();
    for (const s of sessionState) set.add(s.session_status);
    return Array.from(set).sort();
  }, [sessionState]);

  // Filter at the session level first (tutor + status), then re-group into
  // meetings so a tutor/status filter shrinks the slot card to matching rows.
  const filteredSessions = useMemo(
    () =>
      sessionState.filter((s) => {
        if (tutorFilter !== "all" && s.tutor_id !== tutorFilter) return false;
        if (statusFilter !== "all" && s.session_status !== statusFilter)
          return false;
        return true;
      }),
    [sessionState, tutorFilter, statusFilter]
  );

  const meetingsForDate = useMemo(
    () =>
      groupByMeeting(
        filteredSessions.filter((s) => s.session_date === selectedDate)
      ),
    [filteredSessions, selectedDate]
  );

  const allMeetings = useMemo(
    () => groupByMeeting(filteredSessions),
    [filteredSessions]
  );

  const setStatus = (
    sessionId: string,
    next: { session_status: SessionStatusValue; attendance_status?: string }
  ) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id !== sessionId
          ? s
          : {
              ...s,
              session_status: next.session_status,
              attendance_status: next.attendance_status,
            }
      )
    );
  };

  const setPerformance = (
    sessionId: string,
    performance: 1 | 2 | 3 | 4 | 5
  ) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id !== sessionId ? s : { ...s, performance_rating: performance }
      )
    );
  };

  const editorSession = exerciseEditor
    ? sessionState.find((s) => s.id === exerciseEditor.sessionId)
    : null;
  const editorStudentInfo =
    exerciseEditor && studentById.get(exerciseEditor.studentId);
  const makeupSession = makeupOpen
    ? sessionState.find((s) => s.id === makeupOpen.sessionId) ?? null
    : null;

  return (
    <div className="space-y-4">
      <SessionsToolbar
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        onJumpToToday={() => setSelectedDate(DEMO_DAY)}
        isToday={selectedDate === DEMO_DAY}
        tutors={tutorOptions}
        tutorFilter={tutorFilter}
        onTutorChange={setTutorFilter}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={statusOptions}
        view={view}
        onViewChange={setView}
        resultCount={
          view === "list" ? meetingsForDate.length : allMeetings.length
        }
      />

      {view === "weekly" ? (
        <WeeklyView
          meetings={allMeetings}
          anchorDate={selectedDate}
          studentById={studentById}
          onPick={(meeting) => {
            setSelectedDate(meeting.session_date);
            setView("list");
          }}
        />
      ) : (
        <div className="space-y-4">
          {meetingsForDate.length === 0 && (
            <div className="surface-mc p-10 text-center">
              <CalendarClock className="h-8 w-8 text-ink-300 mx-auto" />
              <div className="mt-2 text-sm font-medium text-ink-700">
                No sessions on this day
              </div>
              <div className="mt-1 text-xs text-ink-500">
                Try a different date or clear the tutor/status filter.
              </div>
            </div>
          )}
          {meetingsForDate.map((meeting) => {
            const isHighlighted = meeting.members.some(
              (m) => m.id === highlightSessionId
            );
            return (
              <div
                key={meeting.key}
                ref={isHighlighted ? highlightedRef : undefined}
              >
                <MeetingCard
                  meeting={meeting}
                  studentById={studentById}
                  highlighted={isHighlighted}
                  highlightSessionId={highlightSessionId}
                  nextByStudent={nextByStudent}
                  pendingHwBySessionId={pendingHwBySessionId}
                  sessionLabel={sessionLabel}
                  onSetStatus={setStatus}
                  onPerformance={setPerformance}
                  onOpenExercise={(sessionId, studentId, kind) =>
                    setExerciseEditor({ sessionId, studentId, kind })
                  }
                  onScheduleMakeup={(sessionId, studentId) =>
                    setMakeupOpen({ sessionId, studentId })
                  }
                  onOpenChecktable={(studentId, focusItemId) =>
                    setDrawerOpen({ studentId, focusItemId })
                  }
                  onRemoveExercise={removeExercise}
                  onMarkPreviousHw={(currentSessionId, studentId, exerciseId, choice) =>
                    recordHomeworkCompletion({
                      current_session_id: currentSessionId,
                      session_exercise_id: exerciseId,
                      student_id: studentId,
                      submitted: choice !== "not-done",
                      completion_status:
                        choice === "complete"
                          ? "Complete"
                          : choice === "partial"
                            ? "Partial"
                            : "Not done",
                    })
                  }
                />
              </div>
            );
          })}
        </div>
      )}

      {exerciseEditor && editorSession && editorStudentInfo && (
        <RecordExerciseModal
          session={editorSession}
          student={editorStudentInfo}
          kind={exerciseEditor.kind}
          checktables={checktables}
          onClose={() => setExerciseEditor(null)}
          onAdd={(input) => {
            recordExercise({
              sessionId: exerciseEditor.sessionId,
              studentId: exerciseEditor.studentId,
              kind: exerciseEditor.kind,
              ...input,
            });
          }}
          onRemove={(exerciseId) =>
            removeExercise(
              exerciseEditor.sessionId,
              exerciseEditor.kind,
              exerciseId
            )
          }
        />
      )}

      {makeupOpen && (
        <MakeupModal
          student={studentById.get(makeupOpen.studentId)!}
          fromSessionId={makeupOpen.sessionId}
          session={makeupSession}
          onClose={() => setMakeupOpen(null)}
        />
      )}

      {drawerOpen && studentById.get(drawerOpen.studentId) && (
        <ChecktableDrawer
          student={studentById.get(drawerOpen.studentId)!}
          focusItemId={drawerOpen.focusItemId}
          onClose={() => setDrawerOpen(null)}
        />
      )}
    </div>
  );
}

function MeetingCard({
  meeting,
  studentById,
  highlighted,
  highlightSessionId,
  nextByStudent,
  pendingHwBySessionId,
  sessionLabel,
  onSetStatus,
  onPerformance,
  onOpenExercise,
  onScheduleMakeup,
  onOpenChecktable,
  onRemoveExercise,
  onMarkPreviousHw,
}: {
  meeting: ClassMeeting;
  studentById: Map<string, Student>;
  highlighted: boolean;
  highlightSessionId: string | null;
  nextByStudent: Map<string, NextSuggestion | null>;
  pendingHwBySessionId: Map<string, PendingHomeworkCheck>;
  sessionLabel: (sessionId: string) => string;
  onSetStatus: (
    sessionId: string,
    next: { session_status: SessionStatusValue; attendance_status?: string }
  ) => void;
  onPerformance: (sessionId: string, p: 1 | 2 | 3 | 4 | 5) => void;
  onOpenExercise: (
    sessionId: string,
    studentId: string,
    kind: "CW" | "HW"
  ) => void;
  onScheduleMakeup: (sessionId: string, studentId: string) => void;
  onOpenChecktable: (studentId: string, focusItemId?: string) => void;
  onRemoveExercise: (
    sessionId: string,
    kind: "CW" | "HW",
    exerciseId: string
  ) => void;
  onMarkPreviousHw: (
    currentSessionId: string,
    studentId: string,
    exerciseId: string,
    choice: PreviousHwChoice
  ) => void;
}) {
  const slotLabel = formatTimeSlot(meeting.start_time, meeting.duration_mins);
  const memberCount = meeting.members.length;

  return (
    <div
      className={`surface-mc overflow-hidden ${
        highlighted ? "ring-2 ring-mc-red-500 ring-offset-2" : ""
      }`}
    >
      {/* Slot header — time slot is the focal point of the card, sized up
       *  to confidently anchor the eye. Tutor + member count sit right in
       *  quieter weight. Make-up meetings flip to yellow rule + cream
       *  tint. */}
      <div
        className={`px-4 py-2.5 border-l-[3px] border-b border-b-mc-line flex items-center justify-between gap-3 ${
          meeting.is_makeup
            ? "bg-mc-yellow-50 border-l-mc-yellow-500"
            : "bg-white border-l-mc-red-600"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Clock className="h-4 w-4 text-ink-400 shrink-0" />
          <span className="text-[15px] font-bold text-ink-900 tabular-nums tracking-tight">
            {slotLabel}
          </span>
          {meeting.is_makeup && (
            <span className="text-[10px] rounded-md bg-mc-yellow-500 text-ink-900 px-1.5 py-0.5 font-semibold shrink-0">
              Make-up
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 text-xs text-ink-500">
          <span className="hidden sm:inline">{meeting.tutor_name}</span>
          <span className="hidden sm:inline text-ink-300">·</span>
          <span className="tabular-nums">
            {memberCount} {memberCount === 1 ? "student" : "students"}
          </span>
        </div>
      </div>

      {meeting.class_wide_note && (
        <div className="px-4 py-1.5 text-xs text-ink-700 bg-ink-50 border-b border-mc-line">
          <span className="text-[10px] font-semibold tracking-wide text-ink-500 mr-1.5 uppercase">
            Class note
          </span>
          {meeting.class_wide_note}
        </div>
      )}

      <div className="divide-y divide-mc-line">
        {meeting.members.map((session) => {
          const student = studentById.get(session.student_id);
          if (!student) return null;
          const isHighlightedRow = session.id === highlightSessionId;
          return (
            <StudentRow
              key={session.id}
              session={session}
              student={student}
              highlightedRow={isHighlightedRow}
              nextSuggestion={nextByStudent.get(session.student_id) ?? null}
              pendingHw={pendingHwBySessionId.get(session.id) ?? null}
              sessionLabel={sessionLabel}
              onSetStatus={(next) => onSetStatus(session.id, next)}
              onPerformance={(p) => onPerformance(session.id, p)}
              onOpenExercise={(k) =>
                onOpenExercise(session.id, session.student_id, k)
              }
              onRemoveExercise={(k, id) =>
                onRemoveExercise(session.id, k, id)
              }
              onScheduleMakeup={() =>
                onScheduleMakeup(session.id, session.student_id)
              }
              onOpenChecktable={(focusItemId) =>
                onOpenChecktable(session.student_id, focusItemId)
              }
              onMarkPreviousHw={(exerciseId, choice) =>
                onMarkPreviousHw(
                  session.id,
                  session.student_id,
                  exerciseId,
                  choice
                )
              }
            />
          );
        })}
      </div>
    </div>
  );
}

/** Sessions whose status can be changed via the inline action buttons.
 *  Once attended / no-show'd / makeup-booked, the row finalizes and the
 *  buttons hide (matching CSM behavior). */
function isNotAttended(s: SessionStatusValue): boolean {
  return (
    s === SessionStatus.SCHEDULED ||
    s === SessionStatus.TRIAL_CLASS ||
    s === SessionStatus.MAKEUP_CLASS
  );
}

function isPendingMakeup(s: SessionStatusValue): boolean {
  return (
    s === SessionStatus.SICK_LEAVE_PENDING ||
    s === SessionStatus.WEATHER_PENDING ||
    s === SessionStatus.RESCHEDULED_PENDING
  );
}

function StudentRow({
  session,
  student,
  highlightedRow,
  nextSuggestion,
  pendingHw,
  sessionLabel,
  onSetStatus,
  onPerformance,
  onOpenExercise,
  onRemoveExercise,
  onScheduleMakeup,
  onOpenChecktable,
  onMarkPreviousHw,
}: {
  session: Session;
  student: Student;
  highlightedRow: boolean;
  nextSuggestion: NextSuggestion | null;
  pendingHw: PendingHomeworkCheck | null;
  sessionLabel: (sessionId: string) => string;
  onSetStatus: (next: {
    session_status: SessionStatusValue;
    attendance_status?: string;
  }) => void;
  onPerformance: (p: 1 | 2 | 3 | 4 | 5) => void;
  onOpenExercise: (k: "CW" | "HW") => void;
  onRemoveExercise: (k: "CW" | "HW", id: string) => void;
  onScheduleMakeup: () => void;
  onOpenChecktable: (focusItemId?: string) => void;
  onMarkPreviousHw: (exerciseId: string, choice: PreviousHwChoice) => void;
}) {
  const statusConfig = getSessionStatusConfig(session.session_status);
  const StatusIcon = statusConfig.Icon;
  const showAttendanceActions = isNotAttended(session.session_status);
  const showMakeupAction = isPendingMakeup(session.session_status);

  return (
    <div
      className={`px-3 py-2 min-w-0 space-y-1.5 ${
        highlightedRow ? "bg-mc-yellow-50" : statusConfig.tintClass
      }`}
      style={{ opacity: statusConfig.opacity ?? 1 }}
    >
      {/* ── Identity line: code · name · grade pill · school pill (+ HW load
       *  pill when not Normal) on the left, status pill on the right. One
       *  line; pills are quiet but coloured enough to anchor scanning. ── */}
      <div className="flex items-center justify-between gap-3">
        <div
          className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 ${
            statusConfig.strikethrough ? "line-through" : ""
          }`}
        >
          <span className="text-[11px] text-ink-500 tabular-nums shrink-0">
            {student.code}
          </span>
          <Link
            href={`/students/${student.id}`}
            className={`text-sm font-semibold truncate hover:underline ${
              statusConfig.strikethrough ? "text-ink-500" : "text-ink-900"
            }`}
          >
            {student.name}
          </Link>
          <span
            className={`text-[10px] font-medium rounded px-1.5 py-0.5 shrink-0 ${gradeBadgeStyle(
              student.grade
            )}`}
          >
            {student.grade}
          </span>
          <span className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-ink-100 text-ink-600 shrink-0">
            {student.school}
          </span>
          {student.hwLoad !== "Normal" && (
            <span
              className="text-[10px] rounded px-1.5 py-0.5 bg-ink-100 text-ink-600 shrink-0"
              title="Preferred homework load"
            >
              HW: {student.hwLoad}
            </span>
          )}
        </div>
        <StatusPill
          status={session.session_status}
          statusConfig={statusConfig}
          icon={StatusIcon}
        />
      </div>

      {session.notes && (
        <div className="text-[11px] text-ink-600 italic">
          &ldquo;{session.notes}&rdquo;
        </div>
      )}

      {pendingHw && (
        <PreviousHomeworkToCheck
          pending={pendingHw}
          sourceLabel={sessionLabel(pendingHw.session.id)}
          onMark={onMarkPreviousHw}
        />
      )}

      {/* CW + HW on one row to halve the vertical footprint. The HW side
       *  surfaces the "Next" suggestion as a quiet ghost button at the
       *  end of its chip list. */}
      <div className="flex flex-col gap-1">
        <ExerciseRow
          kind="CW"
          items={session.cw}
          onOpen={() => onOpenExercise("CW")}
          onRemove={(id) => onRemoveExercise("CW", id)}
        />
        <ExerciseRow
          kind="HW"
          items={session.hw}
          onOpen={() => onOpenExercise("HW")}
          onRemove={(id) => onRemoveExercise("HW", id)}
          nextSuggestion={nextSuggestion}
          onOpenSuggestion={() =>
            nextSuggestion && onOpenChecktable(nextSuggestion.item.id)
          }
        />
      </div>

      <ActionButtonsRow
        session={session}
        showAttendanceActions={showAttendanceActions}
        showMakeupAction={showMakeupAction}
        performanceValue={session.performance_rating}
        onSetStatus={onSetStatus}
        onPerformance={onPerformance}
        onScheduleMakeup={onScheduleMakeup}
        onOpenChecktable={() => onOpenChecktable()}
        studentId={student.id}
        sessionId={session.id}
      />
    </div>
  );
}

/** Single-element status indicator — replaces both the old colored text-only
 *  status and the 40px-wide right-edge stripe. One coloured pill carries
 *  state for the whole row. */
function StatusPill({
  status,
  statusConfig,
  icon: Icon,
}: {
  status: string;
  statusConfig: ReturnType<typeof getSessionStatusConfig>;
  icon: typeof Clock;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium whitespace-nowrap shrink-0 ${
        statusConfig.textClass
      } ${statusConfig.strikethrough ? "line-through" : ""}`}
      title={status}
    >
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

function ActionButtonsRow({
  session,
  showAttendanceActions,
  showMakeupAction,
  performanceValue,
  onSetStatus,
  onPerformance,
  onScheduleMakeup,
  onOpenChecktable,
  studentId,
  sessionId,
}: {
  session: Session;
  showAttendanceActions: boolean;
  showMakeupAction: boolean;
  performanceValue?: number;
  onSetStatus: (next: {
    session_status: SessionStatusValue;
    attendance_status?: string;
  }) => void;
  onPerformance: (p: 1 | 2 | 3 | 4 | 5) => void;
  onScheduleMakeup: () => void;
  onOpenChecktable: () => void;
  studentId: string;
  sessionId: string;
}) {
  const attendedTarget =
    session.session_status === SessionStatus.MAKEUP_CLASS
      ? SessionStatus.ATTENDED_MAKEUP
      : SessionStatus.ATTENDED;

  // Only draw the divider when there's something visually heavy above it
  // (the attendance picker / make-up button). For finalized rows where the
  // action row is just stars + kebab, the border reads as visual noise.
  const hasHeavyActions = showAttendanceActions || showMakeupAction;

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 pt-1.5 ${
        hasHeavyActions ? "border-t border-ink-200" : ""
      }`}
    >
      {showAttendanceActions && (
        <AttendancePicker
          onAttended={() =>
            onSetStatus({
              session_status: attendedTarget,
              attendance_status: undefined,
            })
          }
          onNoShow={() =>
            onSetStatus({
              session_status: SessionStatus.NO_SHOW,
              attendance_status: undefined,
            })
          }
          onSetStatus={onSetStatus}
        />
      )}
      {showMakeupAction && (
        <button
          onClick={onScheduleMakeup}
          className="text-[11px] rounded-md px-2 py-0.5 font-medium transition-colors inline-flex items-center gap-1 bg-ink-800 text-white hover:bg-ink-900"
        >
          <CalendarPlus className="h-3 w-3" />
          Schedule make-up
        </button>
      )}

      {/* Right-aligned: rate + overflow menu for checktable / prep print */}
      <div className="ml-auto flex items-center gap-1.5">
        <PerformanceRater value={performanceValue} onChange={onPerformance} />
        <RowOverflowMenu
          onOpenChecktable={onOpenChecktable}
          prepPrintHref={`/checktables?student=${studentId}&prep-session=${sessionId}`}
        />
      </div>
    </div>
  );
}

/** Segmented attendance picker — replaces three colored buttons (Attended /
 *  No show / Can't attend ▾) with one quiet inline-flex group. State colour
 *  shows up only after a choice is made, via the row's status pill. */
function AttendancePicker({
  onAttended,
  onNoShow,
  onSetStatus,
}: {
  onAttended: () => void;
  onNoShow: () => void;
  onSetStatus: (next: {
    session_status: SessionStatusValue;
    attendance_status?: string;
  }) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-ink-200 bg-white overflow-visible text-[11px] font-medium">
      <button
        onClick={onAttended}
        className="px-2 py-0.5 text-ink-700 hover:bg-green-50 hover:text-green-700 inline-flex items-center gap-1 border-r border-ink-200"
      >
        <CheckCircle2 className="h-3 w-3" />
        Attended
      </button>
      <button
        onClick={onNoShow}
        className="px-2 py-0.5 text-ink-700 hover:bg-red-50 hover:text-red-700 inline-flex items-center gap-1 border-r border-ink-200"
      >
        <UserX className="h-3 w-3" />
        No show
      </button>
      <CantAttendMenu onSetStatus={onSetStatus} />
    </div>
  );
}

/** Kebab menu for secondary row actions — Checktable + Prep print. Keeps
 *  the action row visually quiet once a row is "done". */
function RowOverflowMenu({
  onOpenChecktable,
  prepPrintHref,
}: {
  onOpenChecktable: () => void;
  prepPrintHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.right });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll() {
      updatePosition();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="p-1 rounded-md text-ink-400 hover:text-ink-800 hover:bg-ink-100"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        title="More"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              transform: "translateX(-100%)",
            }}
            className="z-50 w-44 bg-white border border-mc-line rounded-md shadow-lg p-1"
          >
            <button
              role="menuitem"
              onClick={() => {
                onOpenChecktable();
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-ink-700 hover:bg-ink-100"
            >
              <Table2 className="h-3.5 w-3.5 text-ink-500" />
              Open checktable
            </button>
            <Link
              role="menuitem"
              href={prepPrintHref}
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-ink-700 hover:bg-ink-100"
              title="Pick items in the checktable, then print them as this session's HW in one shot"
            >
              <Printer className="h-3.5 w-3.5 text-ink-500" />
              Prep print
            </Link>
          </div>,
          document.body
        )}
    </>
  );
}

function PreviousHomeworkToCheck({
  pending,
  sourceLabel,
  onMark,
}: {
  pending: PendingHomeworkCheck;
  sourceLabel: string;
  onMark: (exerciseId: string, choice: PreviousHwChoice) => void;
}) {
  // Quiet variant: rail label like CW/HW (no red tint, no border), source
  // label demoted to ink-400, and each entry renders inline so the whole
  // block collapses to one row in the common single-item case.
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span
        className="w-8 shrink-0 text-[10px] font-semibold text-ink-400 tracking-wide pt-0.5 text-right pr-1"
        title={`Last session · ${sourceLabel}`}
      >
        Prev
      </span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        {pending.entries.map((entry) => (
          <PreviousHomeworkLine
            key={entry.exercise.id}
            entry={entry}
            onMark={(choice) => onMark(entry.exercise.id, choice)}
          />
        ))}
      </div>
    </div>
  );
}

function completionChoice(status?: string): PreviousHwChoice | null {
  if (status === "Complete") return "complete";
  if (status === "Partial") return "partial";
  if (status === "Not done") return "not-done";
  return null;
}

function PreviousHomeworkLine({
  entry,
  onMark,
}: {
  entry: PendingHomeworkEntry;
  onMark: (choice: PreviousHwChoice) => void;
}) {
  const range = formatPageRange(
    entry.exercise.page_start,
    entry.exercise.page_end
  );
  const current = completionChoice(entry.completion?.completion_status);
  const marked = !!entry.completion;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1 text-[11px] bg-white border border-ink-200 rounded-md px-1.5 py-0.5 ${
          marked ? "opacity-60" : ""
        }`}
      >
        <span className="font-mono text-ink-700">{entry.exercise.pdf_name}</span>
        {range && <span className="text-ink-400">·{range}</span>}
      </span>
      <PreviousHwChoiceButtons selected={current} onMark={onMark} />
    </div>
  );
}

function PreviousHwChoiceButtons({
  selected,
  onMark,
}: {
  selected: PreviousHwChoice | null;
  onMark: (choice: PreviousHwChoice) => void;
}) {
  // Icon-only segmented control — labels live in the title for screen
  // readers / hover. The three meanings (✓ ~ ✗) read well enough as glyphs
  // when sitting next to a PDF chip.
  const options: {
    id: PreviousHwChoice;
    label: string;
    selectedCls: string;
    Icon: typeof Check;
  }[] = [
    {
      id: "complete",
      label: "Complete",
      selectedCls: "bg-green-600 text-white border-transparent",
      Icon: Check,
    },
    {
      id: "partial",
      label: "Partial",
      selectedCls: "bg-mc-yellow-500 text-ink-900 border-transparent",
      Icon: CircleDashed,
    },
    {
      id: "not-done",
      label: "Not done",
      selectedCls: "bg-mc-red-600 text-white border-transparent",
      Icon: CircleSlash,
    },
  ];
  return (
    <div className="inline-flex rounded-md border border-ink-200 bg-white p-[1px]">
      {options.map(({ id, label, selectedCls, Icon }) => {
        const isSelected = selected === id;
        return (
          <button
            key={id}
            onClick={() => onMark(id)}
            className={`rounded-md px-1 py-0.5 transition-colors inline-flex items-center justify-center ${
              isSelected
                ? `${selectedCls} font-semibold`
                : "text-ink-500 hover:bg-ink-100"
            }`}
            aria-label={isSelected ? `Marked as ${label}` : `Mark as ${label}`}
            title={isSelected ? `Marked as ${label}` : `Mark as ${label}`}
          >
            <Icon className="h-3 w-3" />
          </button>
        );
      })}
    </div>
  );
}

function ExerciseRow({
  kind,
  items,
  onOpen,
  onRemove,
  nextSuggestion,
  onOpenSuggestion,
}: {
  kind: "CW" | "HW";
  items: SessionExercise[];
  onOpen: () => void;
  onRemove: (id: string) => void;
  /** Only the HW variant uses this; renders a quiet "+ Next 640A" ghost
   *  button after the chip list so the tutor can jump to the suggested
   *  next item without leaving the row. */
  nextSuggestion?: NextSuggestion | null;
  onOpenSuggestion?: () => void;
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      {/* Rail label — 22px wide so CW + HW align vertically. No fill,
       *  ink-400 text — relegates this to "row prefix" weight. */}
      <span className="w-8 shrink-0 text-[10px] font-semibold text-ink-400 tracking-wide pt-0.5 text-right pr-1">
        {kind}
      </span>
      <div className="flex flex-wrap items-center gap-1 min-w-0">
        {items.length === 0 && !nextSuggestion && (
          <button
            onClick={onOpen}
            className="text-[11px] text-ink-400 hover:text-ink-700 inline-flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            add
          </button>
        )}
        {items.map((it) => {
          const range = formatPageRange(it.page_start, it.page_end);
          return (
            <span
              key={it.id}
              className="inline-flex items-center gap-1 text-[11px] bg-white border border-ink-200 rounded-md px-1.5 py-0.5"
              title={range ? `pp. ${range}` : undefined}
            >
              <span className="font-mono text-ink-700">{it.pdf_name}</span>
              {range && <span className="text-ink-400">·{range}</span>}
              <button
                onClick={() => onRemove(it.id)}
                className="text-ink-300 hover:text-ink-700 -mr-0.5"
                aria-label={`Remove ${it.pdf_name}`}
              >
                ×
              </button>
            </span>
          );
        })}
        {items.length > 0 && (
          <button
            onClick={onOpen}
            className="text-[11px] text-ink-400 hover:text-ink-700 inline-flex items-center gap-0.5 px-1"
            aria-label={`Add ${kind} item`}
            title={`Add ${kind} item`}
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
        {nextSuggestion && onOpenSuggestion && (
          <button
            onClick={onOpenSuggestion}
            className="inline-flex items-center gap-1 text-[11px] rounded-md border border-ink-200 bg-white text-ink-600 px-1.5 py-0.5 hover:bg-ink-50 hover:text-ink-800"
            title={`Suggested next · Ch.${nextSuggestion.chapter.number} ${nextSuggestion.chapter.title}`}
          >
            <Plus className="h-3 w-3 text-ink-400" />
            <span className="text-ink-500">Next</span>
            <span className="font-mono">{nextSuggestion.item.code}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function CantAttendMenu({
  onSetStatus,
}: {
  onSetStatus: (next: {
    session_status: SessionStatusValue;
    attendance_status?: string;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  // Portal-rendered, fixed-positioned popover. Rendering into <body> is the
  // only way to escape ancestor CSS opacity (e.g. Pending/Booked Make-up
  // tints) which would otherwise cascade onto the menu — opacity cannot
  // be restored from a descendant. It also frees the popover from any
  // overflow-hidden clipping on the meeting card.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    setPos({ top: r.top, left: r.left });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScrollOrResize() {
      updatePosition();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  const items: {
    id: string;
    label: string;
    Icon: typeof CalendarClock;
    next: SessionStatusValue;
  }[] = [
    { id: "reschedule", label: "Reschedule", Icon: CalendarClock, next: SessionStatus.RESCHEDULED_PENDING },
    { id: "sick", label: "Sick leave", Icon: Ambulance, next: SessionStatus.SICK_LEAVE_PENDING },
    { id: "weather", label: "Weather", Icon: CloudRain, next: SessionStatus.WEATHER_PENDING },
  ];

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-0.5 text-ink-700 hover:bg-orange-50 hover:text-orange-700 inline-flex items-center gap-1 text-[11px] font-medium"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <XCircle className="h-3 w-3" />
        Can't attend
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              transform: "translateY(calc(-100% - 4px))",
            }}
            className="z-50 w-40 bg-white border border-mc-line rounded-md shadow-lg p-1"
          >
            {items.map(({ id, label, Icon, next }) => (
              <button
                key={id}
                role="menuitem"
                onClick={() => {
                  onSetStatus({
                    session_status: next,
                    attendance_status: undefined,
                  });
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-ink-700 hover:bg-ink-100"
              >
                <Icon className="h-3.5 w-3.5 text-orange-600" />
                {label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

function PerformanceRater({
  value,
  onChange,
}: {
  value?: number;
  onChange: (v: 1 | 2 | 3 | 4 | 5) => void;
}) {
  // hoverIndex previews "would set to N" while the cursor is over star N.
  // Falls back to the persisted value so unhovered rated state still shows
  // the correct number of filled stars.
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const isRated = !!value && value > 0;
  const active = hoverIndex ?? value ?? 0;

  const Stars = (
    <div
      className="flex items-center gap-0.5"
      onMouseLeave={() => setHoverIndex(null)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onChange(n as 1 | 2 | 3 | 4 | 5)}
          onMouseEnter={() => setHoverIndex(n)}
          onFocus={() => setHoverIndex(n)}
          onBlur={() => setHoverIndex(null)}
          className={`p-0.5 transition-colors ${
            n <= active ? "text-mc-yellow-500" : "text-ink-200"
          }`}
          aria-label={`${n} stars`}
        >
          <Star className="h-3.5 w-3.5 fill-current" />
        </button>
      ))}
    </div>
  );

  // When rated, the 5-star row is always visible.
  if (isRated) return Stars;

  // When unrated, show a quiet "Rate" affordance that swaps to the 5-star
  // row on hover/focus-within. Wrapper handles the hand-off.
  return (
    <div className="group relative inline-flex items-center">
      <button
        type="button"
        className="text-[11px] text-ink-400 inline-flex items-center gap-1 group-hover:opacity-0 group-focus-within:opacity-0 transition-opacity pointer-events-none"
        tabIndex={-1}
        aria-hidden="true"
      >
        <Star className="h-3.5 w-3.5" />
        Rate
      </button>
      <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        {Stars}
      </div>
    </div>
  );
}
