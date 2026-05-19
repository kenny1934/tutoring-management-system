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
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type {
  AttendanceStatus,
  ClassSession,
  RecordedExercise,
  Student,
  SessionStudent,
} from "@/lib/types";
import { usePrimaryStore, type NextSuggestion } from "@/lib/store/PrimaryStore";
import { DEMO_DAY } from "@/lib/mock-data/sessions";
import { RecordExerciseModal } from "./RecordExerciseModal";
import { MakeupModal } from "./MakeupModal";

type ExerciseEditor = {
  sessionId: string;
  studentId: string;
  kind: "CW" | "HW";
};

export function SessionsApp() {
  const {
    sessions: sessionState,
    students,
    checktables,
    assignments,
    itemMeta,
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
    const day = target.startAt.slice(0, 10);
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

  const recentlyCoveredByStudent = useMemo(() => {
    const map = new Map<string, { code: string; doneAt: string }[]>();
    const doneSorted = assignments
      .filter((a) => a.status === "done" && a.doneAt)
      .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
    for (const a of doneSorted) {
      const existing = map.get(a.studentId) ?? [];
      if (existing.length >= 3) continue;
      const code = itemMeta.get(a.itemId)?.item.code;
      if (!code) continue;
      existing.push({ code, doneAt: a.doneAt! });
      map.set(a.studentId, existing);
    }
    return map;
  }, [assignments, itemMeta]);

  const filterCounts = useMemo(() => {
    let today = 0;
    let upcoming = 0;
    let past = 0;
    for (const s of sessionState) {
      const day = s.startAt.slice(0, 10);
      if (day === DEMO_DAY) today += 1;
      else if (day > DEMO_DAY) upcoming += 1;
      else past += 1;
    }
    return { today, upcoming, past };
  }, [sessionState]);

  const filtered = useMemo(
    () =>
      sessionState.filter((s) => {
        const day = s.startAt.slice(0, 10);
        if (filter === "today") return day === DEMO_DAY;
        if (filter === "upcoming") return day > DEMO_DAY;
        return day < DEMO_DAY;
      }),
    [sessionState, filter]
  );

  const setAttendance = (
    sessionId: string,
    studentId: string,
    attendance: AttendanceStatus
  ) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id !== sessionId
          ? s
          : {
              ...s,
              students: s.students.map((st) =>
                st.studentId === studentId ? { ...st, attendance } : st
              ),
            }
      )
    );
  };

  const setPerformance = (
    sessionId: string,
    studentId: string,
    performance: 1 | 2 | 3 | 4 | 5
  ) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id !== sessionId
          ? s
          : {
              ...s,
              students: s.students.map((st) =>
                st.studentId === studentId ? { ...st, performance } : st
              ),
            }
      )
    );
  };

  const editorSession = exerciseEditor
    ? sessionState.find((s) => s.id === exerciseEditor.sessionId)
    : null;
  const editorStudent =
    exerciseEditor && editorSession
      ? editorSession.students.find(
          (st) => st.studentId === exerciseEditor.studentId
        )
      : null;
  const editorStudentInfo =
    exerciseEditor && studentById.get(exerciseEditor.studentId);

  return (
    <div className="space-y-4">
      <FilterBar
        filter={filter}
        onChange={setFilter}
        counts={filterCounts}
      />

      <div className="space-y-4">
        {filtered.length === 0 && (
          <div className="surface p-8 text-center text-ink-500">
            No sessions in this window.
          </div>
        )}
        {filtered.map((session) => {
          const isHighlighted = session.id === highlightSessionId;
          return (
            <div
              key={session.id}
              ref={isHighlighted ? highlightedRef : undefined}
            >
              <SessionCard
                session={session}
                studentById={studentById}
                highlighted={isHighlighted}
                recentlyCoveredByStudent={recentlyCoveredByStudent}
                nextByStudent={nextByStudent}
                onAttendance={(studentId, attendance) =>
                  setAttendance(session.id, studentId, attendance)
                }
                onPerformance={(studentId, perf) =>
                  setPerformance(session.id, studentId, perf)
                }
                onOpenExercise={(studentId, kind) =>
                  setExerciseEditor({ sessionId: session.id, studentId, kind })
                }
                onScheduleMakeup={(studentId) =>
                  setMakeupOpen({ sessionId: session.id, studentId })
                }
                onRemoveExercise={(studentId, kind, exerciseId) =>
                  removeExercise(session.id, studentId, kind, exerciseId)
                }
              />
            </div>
          );
        })}
      </div>

      {exerciseEditor && editorSession && editorStudent && editorStudentInfo && (
        <RecordExerciseModal
          session={editorSession}
          student={editorStudentInfo}
          sessionStudent={editorStudent}
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
              exerciseEditor.studentId,
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
          session={
            sessionState.find((s) => s.id === makeupOpen.sessionId) ?? null
          }
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

function SessionCard({
  session,
  studentById,
  highlighted,
  recentlyCoveredByStudent,
  nextByStudent,
  onAttendance,
  onPerformance,
  onOpenExercise,
  onScheduleMakeup,
  onRemoveExercise,
}: {
  session: ClassSession;
  studentById: Map<string, Student>;
  highlighted?: boolean;
  recentlyCoveredByStudent: Map<string, { code: string; doneAt: string }[]>;
  nextByStudent: Map<string, NextSuggestion | null>;
  onAttendance: (studentId: string, a: AttendanceStatus) => void;
  onPerformance: (studentId: string, p: 1 | 2 | 3 | 4 | 5) => void;
  onOpenExercise: (studentId: string, kind: "CW" | "HW") => void;
  onScheduleMakeup: (studentId: string) => void;
  onRemoveExercise: (
    studentId: string,
    kind: "CW" | "HW",
    exerciseId: string
  ) => void;
}) {
  const start = new Date(session.startAt);

  return (
    <div
      className={`surface overflow-hidden ${
        highlighted ? "ring-2 ring-accent-500 ring-offset-2" : ""
      }`}
    >
      <div
        className={`px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 ${
          session.isMakeup
            ? "bg-amber-50 border-b border-amber-200"
            : "bg-ink-50 border-b border-ink-200"
        }`}
      >
        <div className="font-semibold text-ink-900">{session.className}</div>
        <div className="text-xs text-ink-500 flex items-center gap-1">
          <CalendarDays className="h-3 w-3" />
          {start.toLocaleDateString("en-HK", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </div>
        <div className="text-xs text-ink-500 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {start.toLocaleTimeString("en-HK", {
            hour: "numeric",
            minute: "2-digit",
          })}{" "}
          · {session.durationMins} min
        </div>
        <div className="text-xs text-ink-500 flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {session.room}
        </div>
        <div className="text-xs text-ink-500 flex items-center gap-1">
          <User className="h-3 w-3" />
          {session.tutorName}
        </div>
        {session.lessonNumber > 0 && (
          <div className="text-xs rounded-md bg-white border border-ink-200 px-1.5 py-0.5 text-ink-600">
            Lesson #{session.lessonNumber}
          </div>
        )}
        {session.isMakeup && (
          <div className="text-xs rounded-md bg-amber-100 text-amber-700 px-2 py-0.5 font-medium">
            Makeup
          </div>
        )}
      </div>

      {session.rescheduledFrom && (
        <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
          <CalendarClock className="h-3 w-3" />
          {session.rescheduledFrom}
        </div>
      )}

      {session.classWideNote && (
        <div className="px-4 py-2 text-xs text-ink-600 bg-accent-50 border-b border-accent-100 flex items-start gap-2">
          <StickyNote className="h-3 w-3 mt-0.5" />
          {session.classWideNote}
        </div>
      )}

      <div className="divide-y divide-ink-100">
        {session.students.map((ss) => {
          const student = studentById.get(ss.studentId);
          if (!student) return null;
          return (
            <StudentRow
              key={ss.studentId}
              sessionStudent={ss}
              student={student}
              recentlyCovered={recentlyCoveredByStudent.get(ss.studentId) ?? []}
              nextSuggestion={nextByStudent.get(ss.studentId) ?? null}
              onAttendance={(a) => onAttendance(ss.studentId, a)}
              onPerformance={(p) => onPerformance(ss.studentId, p)}
              onOpenExercise={(k) => onOpenExercise(ss.studentId, k)}
              onRemoveExercise={(k, id) =>
                onRemoveExercise(ss.studentId, k, id)
              }
              onScheduleMakeup={() => onScheduleMakeup(ss.studentId)}
            />
          );
        })}
      </div>
    </div>
  );
}

function StudentRow({
  sessionStudent,
  student,
  recentlyCovered,
  nextSuggestion,
  onAttendance,
  onPerformance,
  onOpenExercise,
  onRemoveExercise,
  onScheduleMakeup,
}: {
  sessionStudent: SessionStudent;
  student: Student;
  recentlyCovered: { code: string; doneAt: string }[];
  nextSuggestion: NextSuggestion | null;
  onAttendance: (a: AttendanceStatus) => void;
  onPerformance: (p: 1 | 2 | 3 | 4 | 5) => void;
  onOpenExercise: (k: "CW" | "HW") => void;
  onRemoveExercise: (k: "CW" | "HW", id: string) => void;
  onScheduleMakeup: () => void;
}) {
  return (
    <div className="px-4 py-3 grid grid-cols-1 lg:grid-cols-[200px_140px_1fr_auto] gap-3 lg:items-start">
      <div>
        <div className="font-medium text-ink-900">{student.name}</div>
        <div className="text-xs text-ink-500">
          {student.code} · {student.grade}
        </div>
        <Link
          href={`/checktables?student=${student.id}`}
          className="text-xs text-accent-700 hover:underline mt-1 inline-flex items-center gap-1"
          title="Open this student's checktable"
        >
          <Table2 className="h-3 w-3" />
          Open checktable
        </Link>
        {recentlyCovered.length > 0 && (
          <div
            className="mt-1.5 flex flex-wrap items-center gap-1"
            title="Most recent checktable items marked done — avoid double-assigning"
          >
            <span className="text-[10px] uppercase tracking-wide text-ink-400">
              Recent
            </span>
            {recentlyCovered.map((r) => (
              <span
                key={`${r.code}-${r.doneAt}`}
                className="font-mono text-[10px] rounded bg-emerald-50 text-emerald-700 border border-emerald-200 px-1"
              >
                {r.code}
              </span>
            ))}
          </div>
        )}
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
        {sessionStudent.note && (
          <div className="text-xs text-ink-600 mt-1 italic">
            &ldquo;{sessionStudent.note}&rdquo;
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <AttendancePicker
          value={sessionStudent.attendance}
          onChange={onAttendance}
        />
        {(sessionStudent.attendance === "absent" ||
          sessionStudent.attendance === "late") && (
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
          items={sessionStudent.cw}
          onOpen={() => onOpenExercise("CW")}
          onRemove={(id) => onRemoveExercise("CW", id)}
        />
        <ExerciseRow
          kind="HW"
          items={sessionStudent.hw}
          onOpen={() => onOpenExercise("HW")}
          onRemove={(id) => onRemoveExercise("HW", id)}
        />
      </div>

      <PerformanceRater
        value={sessionStudent.performance}
        onChange={onPerformance}
      />
    </div>
  );
}

function AttendancePicker({
  value,
  onChange,
}: {
  value: AttendanceStatus;
  onChange: (v: AttendanceStatus) => void;
}) {
  const options: {
    id: AttendanceStatus;
    label: string;
    cls: string;
  }[] = [
    { id: "present", label: "Present", cls: "bg-emerald-100 text-emerald-700" },
    { id: "late", label: "Late", cls: "bg-amber-100 text-amber-700" },
    { id: "absent", label: "Absent", cls: "bg-rose-100 text-rose-700" },
    { id: "makeup", label: "Makeup", cls: "bg-accent-100 text-accent-700" },
  ];
  const current = options.find((o) => o.id === value);
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`text-xs rounded-md px-2 py-0.5 border transition-colors ${
            current?.id === o.id
              ? `${o.cls} border-transparent font-medium`
              : "border-ink-200 text-ink-500 hover:bg-ink-50"
          }`}
        >
          {o.label}
        </button>
      ))}
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
  items: RecordedExercise[];
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
        {kind}{" "}
        <span className="opacity-70">({items.length})</span>
      </button>
      <div className="flex flex-wrap gap-1">
        {items.length === 0 && (
          <span className="text-xs text-ink-400 italic">none recorded</span>
        )}
        {items.map((it) => (
          <span
            key={it.id}
            className="inline-flex items-center gap-1 text-xs bg-white border border-ink-200 rounded-md px-1.5 py-0.5"
            title={it.pageRange ? `pp. ${it.pageRange}` : undefined}
          >
            <span className="font-mono text-ink-700">{it.itemCode}</span>
            {it.pageRange && (
              <span className="text-ink-400">·{it.pageRange}</span>
            )}
            <button
              onClick={() => onRemove(it.id)}
              className="text-ink-400 hover:text-ink-800 -mr-0.5"
              aria-label={`Remove ${it.itemCode}`}
            >
              ×
            </button>
          </span>
        ))}
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
