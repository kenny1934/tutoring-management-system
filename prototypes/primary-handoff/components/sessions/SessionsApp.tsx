"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Clock,
  PenTool,
  Home as HomeIcon,
  Star,
  StickyNote,
  CalendarClock,
  Table2,
  ArrowRight,
  Printer,
  ClipboardCheck,
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
      {/* Slot header — CSM-format time_slot (date lives in the toolbar's
       *  date navigator). Thick red left rule; yellow rule + cream tint
       *  when the meeting is a make-up. Tutor + member count on the right
       *  give the at-a-glance "who's running this slot". */}
      <div
        className={`px-4 py-2.5 border-l-4 border-b border-b-mc-line flex items-center justify-between gap-3 ${
          meeting.is_makeup
            ? "bg-mc-yellow-50 border-l-mc-yellow-500"
            : "bg-white border-l-mc-red-600"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="h-4 w-4 text-ink-500 shrink-0" />
          <span className="text-base font-semibold text-ink-900 tabular-nums">
            {slotLabel}
          </span>
          {meeting.is_makeup && (
            <span className="text-[10px] rounded-md bg-mc-yellow-500 text-ink-900 px-1.5 py-0.5 font-semibold shrink-0">
              Make-up
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-ink-500 hidden sm:inline">
            {meeting.tutor_name}
          </span>
          <span className="text-[11px] rounded-full bg-ink-100 text-ink-700 px-2 py-0.5 font-semibold tabular-nums">
            {memberCount} {memberCount === 1 ? "student" : "students"}
          </span>
        </div>
      </div>

      {meeting.class_wide_note && (
        <div className="px-4 py-2 text-xs text-ink-700 bg-mc-cream border-b border-mc-line flex items-start gap-2">
          <StickyNote className="h-3 w-3 mt-0.5 text-mc-red-600" />
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
  const isAttended =
    session.session_status === SessionStatus.ATTENDED ||
    session.session_status === SessionStatus.ATTENDED_MAKEUP;

  return (
    <div
      className={`flex ${
        highlightedRow ? "bg-mc-yellow-50" : statusConfig.tintClass
      }`}
      style={{ opacity: statusConfig.opacity ?? 1 }}
    >
      {/* Main content. Padding deliberately kept tight (p-2.5) and the
       *  internal sections are separated by space-y-1.5 instead of the
       *  earlier 2.5 — the row was previously much taller than CSM's
       *  reference. */}
      <div className="flex-1 p-2.5 min-w-0 space-y-1.5">
        {/* ── Top: student identity + status pill (single line each) ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
            <span
              className={`text-sm text-ink-700 whitespace-nowrap flex-shrink-0 ${
                statusConfig.strikethrough ? "line-through" : ""
              }`}
            >
              {student.code}
            </span>
            <span
              className={`text-sm font-bold ${
                statusConfig.strikethrough ? "line-through text-ink-500" : "text-ink-900"
              }`}
            >
              {student.name}
            </span>
            {session.lesson_number > 0 && (
              <span
                className="text-[9px] leading-[14px] px-1 py-0 min-w-[16px] rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-semibold inline-flex items-center justify-center"
                title="Lesson number within this enrollment"
              >
                L{session.lesson_number}
              </span>
            )}
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${gradeBadgeStyle(
                student.grade
              )}`}
            >
              {student.grade}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium whitespace-nowrap">
              {student.school}
            </span>
            {student.hwLoad !== "Normal" && (
              <span
                className="text-[10px] rounded-md px-1.5 py-0.5 bg-ink-100 text-ink-700 font-medium"
                title="Preferred homework load"
              >
                HW: {student.hwLoad}
              </span>
            )}
          </div>

          {/* Right: status + tutor on one line. Was previously stacked
           *  vertically; collapsing saves ~16px of height per row. */}
          <div className="flex items-center gap-1.5 flex-shrink-0 text-right whitespace-nowrap">
            <span
              className={`text-xs font-medium ${statusConfig.textClass} ${
                statusConfig.strikethrough ? "line-through" : ""
              }`}
            >
              {session.session_status}
              {session.attendance_status === "Late" && (
                <span className="text-[11px] text-mc-yellow-600 font-semibold ml-1">
                  · Late
                </span>
              )}
            </span>
            <span className="text-[11px] text-ink-400">·</span>
            <span className="text-[11px] text-ink-500">{session.tutor_name}</span>
          </div>
        </div>

        {/* ── Notes only — the "Next" suggestion has moved onto the HW
         *  row since it represents "what to assign as HW next". ── */}
        {session.notes && (
          <div className="text-[11px] text-ink-600 italic">
            &ldquo;{session.notes}&rdquo;
          </div>
        )}

        {/* ── Previous HW to check (kept as its own block because it's
         *  interactive). ── */}
        {pendingHw && (
          <PreviousHomeworkToCheck
            pending={pendingHw}
            sourceLabel={sessionLabel(pendingHw.session.id)}
            onMark={onMarkPreviousHw}
          />
        )}

        {/* ── CW + HW on one row to halve the vertical footprint. The
         *  HW side also surfaces the "Next" suggestion as a dashed chip
         *  at the end of its chip list — it's the most natural place
         *  for "what to assign as HW next". ── */}
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
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

        {/* ── Action buttons row — CSM-style attendance/state actions ── */}
        <ActionButtonsRow
          session={session}
          showAttendanceActions={showAttendanceActions}
          showMakeupAction={showMakeupAction}
          isAttended={isAttended}
          performanceValue={session.performance_rating}
          onSetStatus={onSetStatus}
          onPerformance={onPerformance}
          onScheduleMakeup={onScheduleMakeup}
          onOpenChecktable={() => onOpenChecktable()}
          studentId={student.id}
          sessionId={session.id}
        />
      </div>

      {/* Status color stripe — far right, full height. Mirrors CSM's
       *  session card. */}
      <div
        className={`w-8 sm:w-10 flex-shrink-0 flex items-center justify-center ${statusConfig.stripeClass}`}
        style={{ opacity: statusConfig.opacity ?? 1 }}
        title={session.session_status}
      >
        <StatusIcon
          className={`h-4 w-4 sm:h-5 sm:w-5 ${
            statusConfig.iconClass ?? "text-white"
          }`}
        />
      </div>
    </div>
  );
}

function ActionButtonsRow({
  session,
  showAttendanceActions,
  showMakeupAction,
  isAttended,
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
  isAttended: boolean;
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

  // For Attended sessions, surface a Late toggle so the Late attendance
  // attribute can still be set/cleared without an edit modal.
  const showLateToggle = isAttended;
  const isLate = session.attendance_status === "Late";

  return (
    <div className="flex flex-wrap items-center gap-1 pt-1.5 border-t border-ink-200">
      {showAttendanceActions && (
        <>
          <button
            onClick={() =>
              onSetStatus({
                session_status: attendedTarget,
                attendance_status: undefined,
              })
            }
            className="text-[11px] rounded-md px-1.5 py-0.5 font-medium transition-colors inline-flex items-center gap-1 bg-green-100 text-green-700 hover:bg-green-200"
          >
            <CheckCircle2 className="h-3 w-3" />
            Attended
          </button>
          <button
            onClick={() =>
              onSetStatus({
                session_status: SessionStatus.NO_SHOW,
                attendance_status: undefined,
              })
            }
            className="text-[11px] rounded-md px-1.5 py-0.5 font-medium transition-colors inline-flex items-center gap-1 bg-red-100 text-red-700 hover:bg-red-200"
          >
            <UserX className="h-3 w-3" />
            No Show
          </button>
          <CantAttendMenu onSetStatus={onSetStatus} />
        </>
      )}
      {showMakeupAction && (
        <button
          onClick={onScheduleMakeup}
          className="text-[11px] rounded-md px-1.5 py-0.5 font-medium transition-colors inline-flex items-center gap-1 bg-teal-100 text-teal-700 hover:bg-teal-200"
        >
          <CalendarPlus className="h-3 w-3" />
          Schedule Make-up
        </button>
      )}
      {showLateToggle && (
        <button
          onClick={() =>
            onSetStatus({
              session_status: session.session_status,
              attendance_status: isLate ? undefined : "Late",
            })
          }
          className={`text-[11px] rounded-md px-1.5 py-0.5 font-medium transition-colors inline-flex items-center gap-1 border ${
            isLate
              ? "bg-mc-yellow-500 text-ink-900 border-transparent"
              : "bg-white text-ink-600 border-ink-300 hover:bg-mc-yellow-50"
          }`}
          title="Toggle Late attendance qualifier"
        >
          <Clock className="h-3 w-3" />
          Late
        </button>
      )}

      {/* Right-aligned: rate, checktable, print */}
      <div className="ml-auto flex items-center gap-2">
        <PerformanceRater value={performanceValue} onChange={onPerformance} />
        <button
          onClick={onOpenChecktable}
          className="text-[11px] text-mc-red-700 hover:underline inline-flex items-center gap-1"
          title="Open this student's checktable"
        >
          <Table2 className="h-3 w-3" />
          Checktable
        </button>
        <Link
          href={`/checktables?student=${studentId}&prep-session=${sessionId}`}
          className="text-[11px] text-mc-red-700 hover:underline inline-flex items-center gap-1"
          title="Pick items in the checktable, then print them as this session's HW in one shot"
        >
          <Printer className="h-3 w-3" />
          Prep print
        </Link>
      </div>
    </div>
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
  // One-line layout: label + source folded onto the same wrap-line as the
  // entries so the whole block collapses to a single row when there's
  // only one HW to check (the common case).
  return (
    <div className="rounded-md border border-mc-red-200 bg-mc-red-50/60 px-2 py-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-mc-red-700 font-semibold whitespace-nowrap">
        <ClipboardCheck className="h-3 w-3" />
        Prev HW
        <span className="normal-case tracking-normal font-normal text-mc-red-700/70">
          · {sourceLabel}
        </span>
      </span>
      {pending.entries.map((entry) => (
        <PreviousHomeworkLine
          key={entry.exercise.id}
          entry={entry}
          onMark={(choice) => onMark(entry.exercise.id, choice)}
        />
      ))}
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
        className={`inline-flex items-center gap-1 text-xs bg-white border border-ink-200 rounded-md px-1.5 py-0.5 ${
          marked ? "opacity-70" : ""
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
  /** Only the HW variant uses this; renders a dashed "+ Next: …" chip
   *  after the chips list so the tutor can jump to the suggested next
   *  item without leaving the row. */
  nextSuggestion?: NextSuggestion | null;
  onOpenSuggestion?: () => void;
}) {
  const isCW = kind === "CW";
  const tone = isCW
    ? "bg-mc-red-50 border-mc-red-200 text-mc-red-700 hover:bg-mc-red-100"
    : "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100";
  return (
    <div className="flex items-start gap-2">
      <button
        onClick={onOpen}
        className={`text-[11px] rounded-md px-1.5 py-0.5 border flex items-center gap-1 font-medium shrink-0 ${tone}`}
      >
        {isCW ? (
          <PenTool className="h-3 w-3" />
        ) : (
          <HomeIcon className="h-3 w-3" />
        )}
        {kind} <span className="opacity-70">({items.length})</span>
      </button>
      <div className="flex flex-wrap gap-1">
        {items.length === 0 && !nextSuggestion && (
          <span className="text-[11px] text-ink-400 italic">none recorded</span>
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
                className="text-ink-400 hover:text-ink-800 -mr-0.5"
                aria-label={`Remove ${it.pdf_name}`}
              >
                ×
              </button>
            </span>
          );
        })}
        {nextSuggestion && onOpenSuggestion && (
          <button
            onClick={onOpenSuggestion}
            className="inline-flex items-center gap-1 text-[11px] rounded-md border border-dashed border-mc-red-300 bg-mc-red-50/60 text-mc-red-700 px-1.5 py-0.5 hover:bg-mc-red-100"
            title={`Suggested next · Ch.${nextSuggestion.chapter.number} ${nextSuggestion.chapter.title}`}
          >
            <ArrowRight className="h-3 w-3" />
            <span className="uppercase tracking-wide text-[9px] opacity-80">
              Next
            </span>
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
        className="text-[11px] rounded-md px-1.5 py-0.5 font-medium transition-colors inline-flex items-center gap-1 bg-orange-100 text-orange-700 hover:bg-orange-200"
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
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onChange(n as 1 | 2 | 3 | 4 | 5)}
          className={`p-0.5 ${
            value && n <= value ? "text-mc-yellow-500" : "text-ink-200"
          } hover:text-mc-yellow-500`}
          aria-label={`${n} stars`}
        >
          <Star className="h-3.5 w-3.5 fill-current" />
        </button>
      ))}
    </div>
  );
}
