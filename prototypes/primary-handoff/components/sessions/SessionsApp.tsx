"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Clock,
  MapPin,
  User,
  PenTool,
  Home as HomeIcon,
  Star,
  StickyNote,
  CalendarClock,
  Table2,
  ArrowRight,
  Printer,
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
} from "@/lib/store/PrimaryStore";
import { DEMO_DAY } from "@/lib/mock-data/sessions";
import { RecordExerciseModal } from "./RecordExerciseModal";
import { MakeupModal } from "./MakeupModal";

type ExerciseEditor = {
  sessionId: string;
  studentId: string;
  kind: "CW" | "HW";
};

/** UI-only grouping: many per-student Session rows that share class+date+time
 *  display as one card. Kept as a derived view; not stored. */
type ClassMeeting = {
  key: string;
  class_code: string;
  class_name: string;
  session_date: string;
  start_time: string;
  duration_mins: number;
  room: string;
  tutor_name: string;
  lesson_number: number;
  /** True if any sibling session is a make-up class. */
  is_makeup: boolean;
  class_wide_note?: string;
  /** Per-student sessions in this meeting. */
  members: Session[];
};

function groupByMeeting(sessions: Session[]): ClassMeeting[] {
  const map = new Map<string, ClassMeeting>();
  for (const s of sessions) {
    const key = `${s.class_code}|${s.session_date}|${s.start_time}`;
    const existing = map.get(key);
    if (existing) {
      existing.members.push(s);
      if (
        s.session_status === SessionStatus.MAKEUP_CLASS ||
        s.session_status === SessionStatus.ATTENDED_MAKEUP
      ) {
        existing.is_makeup = true;
      }
      if (!existing.class_wide_note && s.class_wide_note) {
        existing.class_wide_note = s.class_wide_note;
      }
    } else {
      map.set(key, {
        key,
        class_code: s.class_code,
        class_name: s.class_name,
        session_date: s.session_date,
        start_time: s.start_time,
        duration_mins: s.duration_mins,
        room: s.room,
        tutor_name: s.tutor_name,
        lesson_number: s.lesson_number,
        is_makeup:
          s.session_status === SessionStatus.MAKEUP_CLASS ||
          s.session_status === SessionStatus.ATTENDED_MAKEUP,
        class_wide_note: s.class_wide_note,
        members: [s],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.session_date !== b.session_date)
      return a.session_date.localeCompare(b.session_date);
    return a.start_time.localeCompare(b.start_time);
  });
}

export function SessionsApp() {
  const {
    sessions: sessionState,
    students,
    checktables,
    setSessions,
    recordExercise,
    removeExercise,
    primaryChecktableId,
    nextSuggestedItem,
  } = usePrimaryStore();

  const [exerciseEditor, setExerciseEditor] =
    useState<ExerciseEditor | null>(null);
  const [makeupOpen, setMakeupOpen] = useState<{
    sessionId: string;
    studentId: string;
  } | null>(null);
  const [filter, setFilter] = useState<"today" | "upcoming" | "past">("today");

  const searchParams = useSearchParams();
  const highlightSessionId = searchParams.get("session");
  const highlightedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!highlightSessionId) return;
    const target = sessionState.find((s) => s.id === highlightSessionId);
    if (!target) return;
    const day = target.session_date;
    if (day === DEMO_DAY) setFilter("today");
    else if (day > DEMO_DAY) setFilter("upcoming");
    else setFilter("past");
  }, [highlightSessionId, sessionState]);

  useEffect(() => {
    if (!highlightSessionId) return;
    if (highlightedRef.current) {
      highlightedRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [highlightSessionId, filter]);

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

  const meetings = useMemo(() => groupByMeeting(sessionState), [sessionState]);

  const filterCounts = useMemo(() => {
    let today = 0;
    let upcoming = 0;
    let past = 0;
    for (const m of meetings) {
      if (m.session_date === DEMO_DAY) today += 1;
      else if (m.session_date > DEMO_DAY) upcoming += 1;
      else past += 1;
    }
    return { today, upcoming, past };
  }, [meetings]);

  const filtered = useMemo(
    () =>
      meetings.filter((m) => {
        if (filter === "today") return m.session_date === DEMO_DAY;
        if (filter === "upcoming") return m.session_date > DEMO_DAY;
        return m.session_date < DEMO_DAY;
      }),
    [meetings, filter]
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
      <FilterBar filter={filter} onChange={setFilter} counts={filterCounts} />

      <div className="space-y-4">
        {filtered.length === 0 && (
          <div className="surface p-8 text-center text-ink-500">
            No sessions in this window.
          </div>
        )}
        {filtered.map((meeting) => {
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
                onSetStatus={setStatus}
                onPerformance={setPerformance}
                onOpenExercise={(sessionId, studentId, kind) =>
                  setExerciseEditor({ sessionId, studentId, kind })
                }
                onScheduleMakeup={(sessionId, studentId) =>
                  setMakeupOpen({ sessionId, studentId })
                }
                onRemoveExercise={removeExercise}
              />
            </div>
          );
        })}
      </div>

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

function FilterBar({
  filter,
  onChange,
  counts,
}: {
  filter: "today" | "upcoming" | "past";
  onChange: (v: "today" | "upcoming" | "past") => void;
  counts: { today: number; upcoming: number; past: number };
}) {
  const items: { id: typeof filter; label: string; count: number }[] = [
    { id: "today", label: "Today", count: counts.today },
    { id: "upcoming", label: "Upcoming", count: counts.upcoming },
    { id: "past", label: "Past", count: counts.past },
  ];
  return (
    <div className="inline-flex rounded-md border border-ink-200 bg-white p-0.5 text-sm">
      {items.map((it) => {
        const active = filter === it.id;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            className={`px-3 py-1 rounded-md ${
              active
                ? "bg-ink-800 text-white"
                : "text-ink-600 hover:bg-ink-100"
            }`}
          >
            {it.label}
            <span
              className={`ml-1 ${active ? "opacity-80" : "text-ink-400"}`}
            >
              ({it.count})
            </span>
          </button>
        );
      })}
    </div>
  );
}

function formatTime(start_time: string): string {
  // "HH:MM" → "4:00pm" (HKT)
  const d = new Date(`2026-01-01T${start_time}:00+08:00`);
  return d.toLocaleTimeString("en-HK", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function MeetingCard({
  meeting,
  studentById,
  highlighted,
  highlightSessionId,
  nextByStudent,
  onSetStatus,
  onPerformance,
  onOpenExercise,
  onScheduleMakeup,
  onRemoveExercise,
}: {
  meeting: ClassMeeting;
  studentById: Map<string, Student>;
  highlighted: boolean;
  highlightSessionId: string | null;
  nextByStudent: Map<string, NextSuggestion | null>;
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
}) {
  const dateLabel = new Date(
    `${meeting.session_date}T${meeting.start_time}:00+08:00`
  ).toLocaleDateString("en-HK", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeLabel = formatTime(meeting.start_time);

  return (
    <div
      className={`surface overflow-hidden ${
        highlighted ? "ring-2 ring-accent-500 ring-offset-2" : ""
      }`}
    >
      <div
        className={`px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 ${
          meeting.is_makeup
            ? "bg-amber-50 border-b border-amber-200"
            : "bg-ink-50 border-b border-ink-200"
        }`}
      >
        <div className="font-semibold text-ink-900">{meeting.class_name}</div>
        <div className="text-xs text-ink-500 flex items-center gap-1">
          <CalendarDays className="h-3 w-3" />
          {dateLabel}
        </div>
        <div className="text-xs text-ink-500 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeLabel} · {meeting.duration_mins} min
        </div>
        <div className="text-xs text-ink-500 flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {meeting.room}
        </div>
        <div className="text-xs text-ink-500 flex items-center gap-1">
          <User className="h-3 w-3" />
          {meeting.tutor_name}
        </div>
        {meeting.lesson_number > 0 && (
          <div className="text-xs rounded-md bg-white border border-ink-200 px-1.5 py-0.5 text-ink-600">
            Lesson #{meeting.lesson_number}
          </div>
        )}
        {meeting.is_makeup && (
          <div className="text-xs rounded-md bg-amber-100 text-amber-700 px-2 py-0.5 font-medium">
            Makeup
          </div>
        )}
      </div>

      {meeting.class_wide_note && (
        <div className="px-4 py-2 text-xs text-ink-600 bg-accent-50 border-b border-accent-100 flex items-start gap-2">
          <StickyNote className="h-3 w-3 mt-0.5" />
          {meeting.class_wide_note}
        </div>
      )}

      <div className="divide-y divide-ink-100">
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
            />
          );
        })}
      </div>
    </div>
  );
}

type PickerChoice = "present" | "late" | "absent";

function pickerChoiceForStatus(s: Session): PickerChoice | null {
  if (s.session_status === SessionStatus.ATTENDED) {
    return s.attendance_status === "Late" ? "late" : "present";
  }
  if (s.session_status === SessionStatus.NO_SHOW) return "absent";
  // Pending make-up variants display as "absent" so the schedule-makeup
  // button remains discoverable.
  if (
    s.session_status === SessionStatus.RESCHEDULED_PENDING ||
    s.session_status === SessionStatus.SICK_LEAVE_PENDING ||
    s.session_status === SessionStatus.WEATHER_PENDING
  )
    return "absent";
  return null;
}

function makeupSubChip(s: Session): { label: string; tone: string } | null {
  switch (s.session_status) {
    case SessionStatus.MAKEUP_CLASS:
      return {
        label: "Make-up class",
        tone: "border-accent-200 bg-accent-50 text-accent-700",
      };
    case SessionStatus.ATTENDED_MAKEUP:
      return {
        label: "Attended (Make-up)",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case SessionStatus.RESCHEDULED_BOOKED:
    case SessionStatus.SICK_LEAVE_BOOKED:
    case SessionStatus.WEATHER_BOOKED:
      return {
        label: "Make-up booked",
        tone: "border-accent-200 bg-accent-50 text-accent-700",
      };
    case SessionStatus.CANCELLED:
      return {
        label: "Cancelled",
        tone: "border-ink-200 bg-ink-100 text-ink-600",
      };
    default:
      return null;
  }
}

function StudentRow({
  session,
  student,
  highlightedRow,
  nextSuggestion,
  onSetStatus,
  onPerformance,
  onOpenExercise,
  onRemoveExercise,
  onScheduleMakeup,
}: {
  session: Session;
  student: Student;
  highlightedRow: boolean;
  nextSuggestion: NextSuggestion | null;
  onSetStatus: (next: {
    session_status: SessionStatusValue;
    attendance_status?: string;
  }) => void;
  onPerformance: (p: 1 | 2 | 3 | 4 | 5) => void;
  onOpenExercise: (k: "CW" | "HW") => void;
  onRemoveExercise: (k: "CW" | "HW", id: string) => void;
  onScheduleMakeup: () => void;
}) {
  const choice = pickerChoiceForStatus(session);
  const subChip = makeupSubChip(session);
  const canScheduleMakeup =
    session.session_status === SessionStatus.NO_SHOW ||
    session.session_status === SessionStatus.SICK_LEAVE_PENDING ||
    session.session_status === SessionStatus.WEATHER_PENDING ||
    session.session_status === SessionStatus.RESCHEDULED_PENDING;

  return (
    <div
      className={`px-4 py-3 grid grid-cols-1 lg:grid-cols-[200px_140px_1fr_auto] gap-3 lg:items-start ${
        highlightedRow ? "bg-accent-50/40" : ""
      }`}
    >
      <div>
        <div className="font-medium text-ink-900">{student.name}</div>
        <div className="text-xs text-ink-500">
          {student.code} · {student.grade}
        </div>
        {nextSuggestion && (
          <Link
            href={`/checktables?student=${student.id}`}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] rounded-md border border-accent-200 bg-accent-50 text-accent-700 px-1.5 py-0.5 hover:bg-accent-100"
            title={`Next untouched item · Ch.${nextSuggestion.chapter.number} ${nextSuggestion.chapter.title}`}
          >
            <ArrowRight className="h-3 w-3" />
            <span className="uppercase tracking-wide text-[9px] text-accent-600/80">
              Next
            </span>
            <span className="font-mono">{nextSuggestion.item.code}</span>
            <span className="text-accent-600/80">
              · Ch.{nextSuggestion.chapter.number} {nextSuggestion.chapter.title}
            </span>
          </Link>
        )}
        {session.notes && (
          <div className="text-xs text-ink-600 mt-1 italic">
            &ldquo;{session.notes}&rdquo;
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <AttendancePicker
          choice={choice}
          subChip={subChip}
          onChange={(c) => {
            if (c === "present")
              onSetStatus({
                session_status: SessionStatus.ATTENDED,
                attendance_status: undefined,
              });
            else if (c === "late")
              onSetStatus({
                session_status: SessionStatus.ATTENDED,
                attendance_status: "Late",
              });
            else
              onSetStatus({
                session_status: SessionStatus.NO_SHOW,
                attendance_status: undefined,
              });
          }}
        />
        {canScheduleMakeup && (
          <button
            onClick={onScheduleMakeup}
            className="text-xs text-accent-700 hover:underline flex items-center gap-1"
          >
            <CalendarClock className="h-3 w-3" />
            Schedule makeup
          </button>
        )}
      </div>

      <div className="space-y-2">
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

      <div className="flex flex-col items-end gap-1.5">
        <PerformanceRater
          value={session.performance_rating}
          onChange={onPerformance}
        />
        <Link
          href={`/checktables?student=${student.id}`}
          className="text-[11px] text-accent-700 hover:underline inline-flex items-center gap-1"
          title="Open this student's checktable"
        >
          <Table2 className="h-3 w-3" />
          Checktable
        </Link>
        <Link
          href={`/checktables?student=${student.id}&prep-session=${session.id}`}
          className="text-[11px] text-accent-700 hover:underline inline-flex items-center gap-1"
          title="Pick items in the checktable, then print them as this session's HW in one shot"
        >
          <Printer className="h-3 w-3" />
          Prep print batch
        </Link>
      </div>
    </div>
  );
}

function AttendancePicker({
  choice,
  subChip,
  onChange,
}: {
  choice: PickerChoice | null;
  subChip: { label: string; tone: string } | null;
  onChange: (v: PickerChoice) => void;
}) {
  const options: {
    id: PickerChoice;
    label: string;
    cls: string;
  }[] = [
    { id: "present", label: "Present", cls: "bg-emerald-100 text-emerald-700" },
    { id: "late", label: "Late", cls: "bg-amber-100 text-amber-700" },
    { id: "absent", label: "Absent", cls: "bg-rose-100 text-rose-700" },
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`text-xs rounded-md px-2 py-0.5 border transition-colors ${
            choice === o.id
              ? `${o.cls} border-transparent font-medium`
              : "border-ink-200 text-ink-500 hover:bg-ink-50"
          }`}
        >
          {o.label}
        </button>
      ))}
      {subChip && (
        <span
          className={`text-xs rounded-md px-2 py-0.5 border font-medium ${subChip.tone}`}
          title="Reflects session status — set automatically by the make-up flow"
        >
          {subChip.label}
        </span>
      )}
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
    ? "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100"
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
            value && n <= value ? "text-amber-500" : "text-ink-200"
          } hover:text-amber-400`}
          aria-label={`${n} stars`}
        >
          <Star className="h-4 w-4 fill-current" />
        </button>
      ))}
    </div>
  );
}
