"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
      {/* Main content */}
      <div className="flex-1 p-3 sm:p-4 min-w-0 space-y-2.5">
        {/* ── Top: student identity + status text ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <span
              className={`text-sm text-ink-700 whitespace-nowrap flex-shrink-0 ${
                statusConfig.strikethrough ? "line-through" : ""
              }`}
            >
              {student.code}
            </span>
            <span
              className={`text-base font-bold ${
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
              className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${gradeBadgeStyle(
                student.grade
              )}`}
            >
              {student.grade}
            </span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium whitespace-nowrap">
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

          {/* Right: status text + tutor (no buttons here — CSM keeps
           *  status display read-only on the card itself, mutations live
           *  in the action buttons row below). */}
          <div className="flex flex-col items-end gap-0.5 flex-shrink-0 text-right">
            <p
              className={`text-sm font-medium ${statusConfig.textClass} ${
                statusConfig.strikethrough ? "line-through" : ""
              }`}
            >
              {session.session_status}
              {session.attendance_status === "Late" && (
                <span className="text-xs text-mc-yellow-600 font-semibold ml-1">
                  · Late
                </span>
              )}
            </p>
            <p className="text-xs text-ink-500">{session.tutor_name}</p>
          </div>
        </div>

        {/* ── Next suggestion + notes ── */}
        {(nextSuggestion || session.notes) && (
          <div className="space-y-1">
            {nextSuggestion && (
              <Link
                href={`/checktables?student=${student.id}`}
                className="inline-flex items-center gap-1 text-[11px] rounded-md border border-mc-red-200 bg-mc-red-50 text-mc-red-700 px-1.5 py-0.5 hover:bg-mc-red-100"
                title={`Next untouched item · Ch.${nextSuggestion.chapter.number} ${nextSuggestion.chapter.title}`}
              >
                <ArrowRight className="h-3 w-3" />
                <span className="uppercase tracking-wide text-[9px] opacity-80">
                  Next
                </span>
                <span className="font-mono">{nextSuggestion.item.code}</span>
                <span className="opacity-80">
                  · Ch.{nextSuggestion.chapter.number}{" "}
                  {nextSuggestion.chapter.title}
                </span>
              </Link>
            )}
            {session.notes && (
              <div className="text-xs text-ink-600 italic">
                &ldquo;{session.notes}&rdquo;
              </div>
            )}
          </div>
        )}

        {/* ── Previous HW to check + today's CW/HW ── */}
        <div className="space-y-2">
          {pendingHw && (
            <PreviousHomeworkToCheck
              pending={pendingHw}
              sourceLabel={sessionLabel(pendingHw.session.id)}
              onMark={onMarkPreviousHw}
            />
          )}
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
  studentId: string;
  sessionId: string;
}) {
  // Decide which state-change actions appear inline based on current
  // status. Matches CSM's session-actions config.
  const stateActions: { id: string; label: string; Icon: typeof CheckCircle2; cls: string; onClick: () => void }[] = [];

  if (showAttendanceActions) {
    const attendedTarget =
      session.session_status === SessionStatus.MAKEUP_CLASS
        ? SessionStatus.ATTENDED_MAKEUP
        : SessionStatus.ATTENDED;
    stateActions.push(
      {
        id: "attended",
        label: "Attended",
        Icon: CheckCircle2,
        cls: "bg-green-100 text-green-700 hover:bg-green-200",
        onClick: () =>
          onSetStatus({
            session_status: attendedTarget,
            attendance_status: undefined,
          }),
      },
      {
        id: "no-show",
        label: "No Show",
        Icon: UserX,
        cls: "bg-red-100 text-red-700 hover:bg-red-200",
        onClick: () =>
          onSetStatus({
            session_status: SessionStatus.NO_SHOW,
            attendance_status: undefined,
          }),
      },
      {
        id: "reschedule",
        label: "Reschedule",
        Icon: CalendarClock,
        cls: "bg-orange-100 text-orange-700 hover:bg-orange-200",
        onClick: () =>
          onSetStatus({
            session_status: SessionStatus.RESCHEDULED_PENDING,
            attendance_status: undefined,
          }),
      },
      {
        id: "sick-leave",
        label: "Sick",
        Icon: Ambulance,
        cls: "bg-orange-100 text-orange-700 hover:bg-orange-200",
        onClick: () =>
          onSetStatus({
            session_status: SessionStatus.SICK_LEAVE_PENDING,
            attendance_status: undefined,
          }),
      },
      {
        id: "weather",
        label: "Weather",
        Icon: CloudRain,
        cls: "bg-orange-100 text-orange-700 hover:bg-orange-200",
        onClick: () =>
          onSetStatus({
            session_status: SessionStatus.WEATHER_PENDING,
            attendance_status: undefined,
          }),
      }
    );
  }

  if (showMakeupAction) {
    stateActions.push({
      id: "schedule-makeup",
      label: "Schedule Make-up",
      Icon: CalendarPlus,
      cls: "bg-teal-100 text-teal-700 hover:bg-teal-200",
      onClick: onScheduleMakeup,
    });
  }

  // For Attended sessions, surface a Late toggle so the Late attendance
  // attribute can still be set/cleared without an edit modal.
  const showLateToggle = isAttended;
  const isLate = session.attendance_status === "Late";

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-ink-200">
      {stateActions.map(({ id, label, Icon, cls, onClick }) => (
        <button
          key={id}
          onClick={onClick}
          className={`text-xs rounded-md px-2 py-1 font-medium transition-colors inline-flex items-center gap-1 ${cls}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
      {showLateToggle && (
        <button
          onClick={() =>
            onSetStatus({
              session_status: session.session_status,
              attendance_status: isLate ? undefined : "Late",
            })
          }
          className={`text-xs rounded-md px-2 py-1 font-medium transition-colors inline-flex items-center gap-1 border ${
            isLate
              ? "bg-mc-yellow-500 text-ink-900 border-transparent"
              : "bg-white text-ink-600 border-ink-300 hover:bg-mc-yellow-50"
          }`}
          title="Toggle Late attendance qualifier"
        >
          <Clock className="h-3.5 w-3.5" />
          Late
        </button>
      )}

      {/* Right-aligned: rate, checktable, print */}
      <div className="ml-auto flex items-center gap-1.5">
        <PerformanceRater value={performanceValue} onChange={onPerformance} />
        <Link
          href={`/checktables?student=${studentId}`}
          className="text-[11px] text-mc-red-700 hover:underline inline-flex items-center gap-1"
          title="Open this student's checktable"
        >
          <Table2 className="h-3 w-3" />
          Checktable
        </Link>
        <Link
          href={`/checktables?student=${studentId}&prep-session=${sessionId}`}
          className="text-[11px] text-mc-red-700 hover:underline inline-flex items-center gap-1"
          title="Pick items in the checktable, then print them as this session's HW in one shot"
        >
          <Printer className="h-3 w-3" />
          Prep print batch
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
  return (
    <div className="rounded-md border border-mc-red-200 bg-mc-red-50/60 p-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-mc-red-700">
        <ClipboardCheck className="h-3 w-3" />
        <span>Previous HW to check</span>
        <span className="normal-case tracking-normal text-mc-red-700/70">
          · from {sourceLabel}
        </span>
      </div>
      <div className="space-y-1">
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
  const options: {
    id: PreviousHwChoice;
    label: string;
    selectedCls: string;
    hoverCls: string;
    Icon: typeof Check;
  }[] = [
    {
      id: "complete",
      label: "Complete",
      selectedCls: "bg-green-600 text-white border-transparent",
      hoverCls: "hover:bg-green-100 hover:text-green-700 hover:border-green-200",
      Icon: Check,
    },
    {
      id: "partial",
      label: "Partial",
      selectedCls: "bg-mc-yellow-500 text-ink-900 border-transparent",
      hoverCls: "hover:bg-mc-yellow-100 hover:text-mc-yellow-600 hover:border-mc-yellow-200",
      Icon: CircleDashed,
    },
    {
      id: "not-done",
      label: "Not done",
      selectedCls: "bg-mc-red-600 text-white border-transparent",
      hoverCls: "hover:bg-mc-red-100 hover:text-mc-red-700 hover:border-mc-red-200",
      Icon: CircleSlash,
    },
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(({ id, label, selectedCls, hoverCls, Icon }) => {
        const isSelected = selected === id;
        return (
          <button
            key={id}
            onClick={() => onMark(id)}
            className={`text-[11px] rounded-md px-1.5 py-0.5 border transition-colors inline-flex items-center gap-1 ${
              isSelected
                ? `${selectedCls} font-semibold`
                : `border-ink-200 text-ink-600 ${hoverCls}`
            }`}
            title={
              isSelected
                ? `Marked as ${label} — click another to change`
                : `Mark as ${label}`
            }
          >
            <Icon className="h-3 w-3" />
            {label}
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
}: {
  kind: "CW" | "HW";
  items: SessionExercise[];
  onOpen: () => void;
  onRemove: (id: string) => void;
}) {
  const isCW = kind === "CW";
  const tone = isCW
    ? "bg-mc-red-50 border-mc-red-200 text-mc-red-700 hover:bg-mc-red-100"
    : "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100";
  return (
    <div className="flex items-start gap-2">
      <button
        onClick={onOpen}
        className={`text-xs rounded-md px-2 py-1 border flex items-center gap-1 font-medium shrink-0 ${tone}`}
      >
        {isCW ? (
          <PenTool className="h-3 w-3" />
        ) : (
          <HomeIcon className="h-3 w-3" />
        )}
        {kind} <span className="opacity-70">({items.length})</span>
      </button>
      <div className="flex flex-wrap gap-1">
        {items.length === 0 && (
          <span className="text-xs text-ink-400 italic">none recorded</span>
        )}
        {items.map((it) => {
          const range = formatPageRange(it.page_start, it.page_end);
          return (
            <span
              key={it.id}
              className="inline-flex items-center gap-1 text-xs bg-white border border-ink-200 rounded-md px-1.5 py-0.5"
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
      </div>
    </div>
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
