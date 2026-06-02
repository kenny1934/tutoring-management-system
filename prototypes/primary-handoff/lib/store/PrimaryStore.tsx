"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type {
  Assessment,
  AssessmentStage,
  AssignTarget,
  Checktable,
  ChecktableAssignment,
  ChecktableChapter,
  ChecktableItem,
  Enrollment,
  EnrollmentType,
  ExerciseKind,
  HomeworkCompletion,
  ParentContact,
  Session,
  SessionExercise,
  SessionStatusValue,
  Student,
  WeekdayNum,
} from "@/lib/types";
import { SessionStatus } from "@/lib/types";
import { generateSessions } from "@/lib/enrollment-utils";
import { students as seedStudents } from "@/lib/mock-data/students";
import { checktables as seedChecktables } from "@/lib/mock-data/checktables";
import { mcDriveChecktables } from "@/lib/mock-data/mc-drive-checktables";
import { seedAssignments } from "@/lib/mock-data/assignments";
import {
  DEMO_DAY,
  enrollments as seedEnrollments,
  sessions as seedSessions,
} from "@/lib/mock-data/sessions";
import { seedHomeworkCompletions } from "@/lib/mock-data/homework-completions";
import { parentContacts as seedContacts } from "@/lib/mock-data/parent-contacts";
import { assessments as seedAssessments } from "@/lib/mock-data/assessments";
import { newId } from "@/lib/id";

type ExerciseInput = {
  sessionId: string;
  studentId: string;
  kind: ExerciseKind;
  pdf_name: string;
  item_id?: string;
  page_start?: number;
  page_end?: number;
  remarks?: string;
};

export type CreateEnrollmentInput = {
  student_id: string;
  tutor_id: string;
  tutor_name: string;
  enrollment_type: EnrollmentType;
  assigned_day: WeekdayNum;
  assigned_time: string;
  duration_mins: number;
  room: string;
  first_lesson_date: string;
  lessons_paid: number;
  is_new_student: boolean;
  remark?: string;
};

/** Page-range UI strings ("1-2" or "5") parse to start/end numbers; empty
 *  strings yield both undefined. */
export function parsePageRange(raw?: string): {
  page_start?: number;
  page_end?: number;
} {
  if (!raw) return {};
  const m = raw.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if (!m) return {};
  const start = Number(m[1]);
  const end = m[2] ? Number(m[2]) : undefined;
  return { page_start: start, page_end: end };
}

/** Inverse of parsePageRange — render a page-range for display. */
export function formatPageRange(
  page_start?: number,
  page_end?: number
): string {
  if (page_start === undefined) return "";
  if (page_end === undefined || page_end === page_start)
    return String(page_start);
  return `${page_start}-${page_end}`;
}

type ItemMeta = {
  item: ChecktableItem;
  checktableId: string;
  /** Undefined for supplementary items (no chapter). */
  chapter?: ChecktableChapter;
  /** Section label such as "上學期" or "補充教材". */
  sectionLabel: string;
};

export type NextSuggestion = {
  item: ChecktableItem;
  chapter: ChecktableChapter;
  checktableId: string;
};

export type PendingHomeworkEntry = {
  exercise: SessionExercise;
  /** Completion row, if one has been recorded. The selector only returns
   *  entries whose completion (if any) was made in the current session
   *  — older completions made elsewhere are dropped so the row doesn't
   *  re-surface stale checks. */
  completion?: HomeworkCompletion;
};

export type PendingHomeworkCheck = {
  /** The prior session the HW was assigned in. */
  session: Session;
  /** All HW entries from that session that are still in scope for the
   *  current check: either no completion yet, or completion recorded in
   *  the current session (so it stays visible after the tutor marks it). */
  entries: PendingHomeworkEntry[];
};

type Store = {
  students: Student[];
  enrollments: Enrollment[];
  checktables: Checktable[];
  sessions: Session[];
  assignments: ChecktableAssignment[];
  homeworkCompletions: HomeworkCompletion[];
  contacts: ParentContact[];
  assessments: Assessment[];

  /** Lookup any item by id; carries its checktable id too. */
  itemMeta: Map<string, ItemMeta>;

  setSessions: (updater: (s: Session[]) => Session[]) => void;
  setAssignments: (
    updater: (a: ChecktableAssignment[]) => ChecktableAssignment[]
  ) => void;
  setContacts: (updater: (c: ParentContact[]) => ParentContact[]) => void;
  setAssessments: (updater: (a: Assessment[]) => Assessment[]) => void;
  /** Move an assessment to a new stage on the kanban. */
  setAssessmentStage: (id: string, stage: AssessmentStage) => void;

  /** Record CW/HW for a student in a session. Also writes a ChecktableAssignment
   *  (status `done` for CW, `assigned` for HW) when the item links to a checktable. */
  recordExercise: (input: ExerciseInput) => void;
  /** Remove a recorded exercise; also removes the auto-linked assignment, if any. */
  removeExercise: (
    sessionId: string,
    kind: ExerciseKind,
    exerciseId: string
  ) => void;

  /** Items queued for printing, scoped per student so switching students
   *  shows that student's own batch. */
  getPrintBatch: (studentId: string) => string[];
  togglePrintBatch: (studentId: string, itemId: string) => void;
  removeFromPrintBatch: (studentId: string, itemId: string) => void;
  clearPrintBatch: (studentId: string) => void;

  /** Record that a homework SessionExercise was checked in a (later) session.
   *  Creates a HomeworkCompletion row and also flips any matching
   *  ChecktableAssignment to status=done. */
  recordHomeworkCompletion: (input: {
    current_session_id: string;
    session_exercise_id: string;
    student_id: string;
    submitted: boolean;
    completion_status?: string;
    tutor_comments?: string;
    checked_by?: string;
  }) => void;

  /** Create a new Enrollment and spawn its Session rows from the weekly
   *  recurrence rule (with holiday skips). Returns the new enrollment id. */
  createEnrollment: (input: CreateEnrollmentInput) => string;

  /** Spawn a make-up Session for a student. Sets make_up_for_id on the new
   *  session, rescheduled_to_id on the source, and transitions the source's
   *  session_status into the appropriate *_BOOKED state. */
  createMakeupSession: (input: {
    fromSessionId: string;
    studentId: string;
    template: {
      session_date: string;
      start_time: string;
      duration_mins: number;
      room: string;
      tutor_id: string;
      tutor_name: string;
    };
    reason?: string;
  }) => string;

  /** HW from a student's most recent prior attended session that hasn't
   *  been recorded as a HomeworkCompletion yet. Used by the session view to
   *  prompt "Previous HW to check" before today's class begins. Returns
   *  null when there's no candidate session or every prior HW is accounted
   *  for. */
  pendingPreviousHomework: (
    studentId: string,
    currentSessionId: string
  ) => PendingHomeworkCheck | null;

  /** Checktable the student is most actively working in (most assignments),
   *  or the first checktable as a fallback. */
  primaryChecktableId: (studentId: string) => string;
  /** First item with no assignment yet from the lowest-numbered chapter the
   *  student has touched. Falls back to next chapter's first item if the
   *  current chapter is fully covered, or to the very first item if the
   *  student has no assignments yet. */
  nextSuggestedItem: (
    studentId: string,
    checktableId: string
  ) => NextSuggestion | null;

  sessionLabel: (sessionId: string) => string;

  /** All upcoming sessions across every student, as assign targets for the
   *  Courseware page's student-less assign flow. */
  assignableSessions: () => AssignTarget[];
};

const StoreContext = createContext<Store | null>(null);

function formatSessionLabel(session: Session): string {
  const d = new Date(`${session.session_date}T${session.start_time}:00+08:00`);
  const weekday = d.toLocaleDateString("en-HK", { weekday: "short" });
  const time = d.toLocaleTimeString("en-HK", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${session.session_date} ${weekday} ${time}`;
}

function buildItemMeta(checktables: Checktable[]): Map<string, ItemMeta> {
  const map = new Map<string, ItemMeta>();
  for (const t of checktables) {
    for (const sec of t.sections) {
      for (const ch of sec.chapters) {
        for (const sId of Object.keys(ch.cells)) {
          for (const item of ch.cells[sId].items) {
            map.set(item.id, {
              item,
              checktableId: t.id,
              chapter: ch,
              sectionLabel: sec.label,
            });
          }
        }
      }
    }
    for (const item of t.supplementary) {
      map.set(item.id, {
        item,
        checktableId: t.id,
        sectionLabel: "補充教材",
      });
    }
  }
  return map;
}

/** Map an absent-session status to the one that should fire when a make-up
 *  is booked. Different reasons (sick / weather / generic) have different
 *  status pairs in CSM. */
function statusAfterMakeupBooked(
  current: SessionStatusValue
): SessionStatusValue {
  switch (current) {
    case SessionStatus.SICK_LEAVE_PENDING:
      return SessionStatus.SICK_LEAVE_BOOKED;
    case SessionStatus.WEATHER_PENDING:
      return SessionStatus.WEATHER_BOOKED;
    default:
      return SessionStatus.RESCHEDULED_BOOKED;
  }
}

export function PrimaryStoreProvider({ children }: { children: ReactNode }) {
  const [students] = useState<Student[]>(seedStudents);
  const [enrollments, setEnrollments] =
    useState<Enrollment[]>(seedEnrollments);
  // Mock textbooks plus the real MC Drive worksheet checktables. The MC Drive
  // ones carry source:"mc-drive" so they show on the Courseware page and only
  // surface in a student's book dropdown when grade-appropriate.
  const [checktables] = useState<Checktable[]>(() => [
    ...seedChecktables,
    ...mcDriveChecktables,
  ]);
  const [sessions, setSessions] = useState<Session[]>(seedSessions);
  const [assignments, setAssignments] =
    useState<ChecktableAssignment[]>(seedAssignments);
  const [homeworkCompletions, setHomeworkCompletions] = useState<
    HomeworkCompletion[]
  >(seedHomeworkCompletions);
  const [contacts, setContacts] = useState<ParentContact[]>(seedContacts);
  const [assessments, setAssessments] =
    useState<Assessment[]>(seedAssessments);

  const setAssessmentStage = useCallback(
    (id: string, stage: AssessmentStage) => {
      setAssessments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, stage } : a))
      );
    },
    []
  );
  const [printBatchByStudent, setPrintBatchByStudent] = useState<
    Record<string, string[]>
  >({});

  const itemMeta = useMemo(() => buildItemMeta(checktables), [checktables]);

  // Keep recordExercise/createMakeupSession stable while still reading fresh state
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const itemMetaRef = useRef(itemMeta);
  itemMetaRef.current = itemMeta;

  const sessionLabel = useCallback((sessionId: string) => {
    const s = sessionsRef.current.find((x) => x.id === sessionId);
    return s ? formatSessionLabel(s) : "";
  }, []);

  const recordExercise = useCallback((input: ExerciseInput) => {
    const recordedId = newId("rec");
    const newExercise: SessionExercise = {
      id: recordedId,
      session_id: input.sessionId,
      exercise_type: input.kind,
      pdf_name: input.pdf_name,
      item_id: input.item_id,
      page_start: input.page_start,
      page_end: input.page_end,
      remarks: input.remarks,
    };

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== input.sessionId) return s;
        if (s.student_id !== input.studentId) return s;
        return input.kind === "CW"
          ? { ...s, cw: [...s.cw, newExercise] }
          : { ...s, hw: [...s.hw, newExercise] };
      })
    );

    const itemId = input.item_id;
    if (!itemId) return;
    const meta = itemMetaRef.current.get(itemId);
    if (!meta) return;
    const checktableId = meta.checktableId;

    const sourceSession = sessionsRef.current.find(
      (s) => s.id === input.sessionId
    );
    const label = sourceSession ? formatSessionLabel(sourceSession) : "";
    const nowIso = new Date().toISOString();
    const status = input.kind === "CW" ? "done" : "assigned";
    const pageRangeStr = formatPageRange(input.page_start, input.page_end);

    setAssignments((prev) => {
      const existing = prev.find(
        (a) =>
          a.studentId === input.studentId &&
          a.checktableId === checktableId &&
          a.itemId === itemId
      );
      if (existing) {
        return prev.map((a) =>
          a.id === existing.id
            ? {
                ...a,
                status,
                pageRange: pageRangeStr || a.pageRange,
                tutorNote: input.remarks ?? a.tutorNote,
                sessionLabel: label || a.sessionLabel,
                sessionId: input.sessionId,
                sourceRecordedExerciseId: recordedId,
                doneAt: status === "done" ? nowIso : a.doneAt,
              }
            : a
        );
      }
      const newAssignment: ChecktableAssignment = {
        id: newId("a"),
        studentId: input.studentId,
        checktableId,
        itemId,
        status,
        assignedAt: nowIso,
        doneAt: status === "done" ? nowIso : undefined,
        pageRange: pageRangeStr || undefined,
        tutorNote: input.remarks,
        sessionLabel: label,
        sessionId: input.sessionId,
        sourceRecordedExerciseId: recordedId,
      };
      return [...prev, newAssignment];
    });
  }, []);

  const removeExercise = useCallback(
    (sessionId: string, kind: ExerciseKind, exerciseId: string) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const key = kind === "CW" ? "cw" : "hw";
          return {
            ...s,
            [key]: s[key].filter((e) => e.id !== exerciseId),
          };
        })
      );
      setAssignments((prev) =>
        prev.filter((a) => a.sourceRecordedExerciseId !== exerciseId)
      );
    },
    []
  );

  const getPrintBatch = useCallback(
    (studentId: string) => printBatchByStudent[studentId] ?? [],
    [printBatchByStudent]
  );

  const togglePrintBatch = useCallback(
    (studentId: string, itemId: string) => {
      setPrintBatchByStudent((prev) => {
        const cur = prev[studentId] ?? [];
        const next = cur.includes(itemId)
          ? cur.filter((id) => id !== itemId)
          : [...cur, itemId];
        return { ...prev, [studentId]: next };
      });
    },
    []
  );

  const removeFromPrintBatch = useCallback(
    (studentId: string, itemId: string) => {
      setPrintBatchByStudent((prev) => {
        const cur = prev[studentId] ?? [];
        return { ...prev, [studentId]: cur.filter((id) => id !== itemId) };
      });
    },
    []
  );

  const clearPrintBatch = useCallback((studentId: string) => {
    setPrintBatchByStudent((prev) => {
      if (!(studentId in prev)) return prev;
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
  }, []);

  const recordHomeworkCompletion = useCallback(
    (input: {
      current_session_id: string;
      session_exercise_id: string;
      student_id: string;
      submitted: boolean;
      completion_status?: string;
      tutor_comments?: string;
      checked_by?: string;
    }) => {
      const nowIso = new Date().toISOString();
      setHomeworkCompletions((prev) => {
        // Upsert by (student, exercise, current session) so re-marking the
        // same HW from the same session updates rather than appending.
        const idx = prev.findIndex(
          (c) =>
            c.student_id === input.student_id &&
            c.session_exercise_id === input.session_exercise_id &&
            c.current_session_id === input.current_session_id
        );
        const next: HomeworkCompletion = {
          id: idx === -1 ? newId("hc") : prev[idx].id,
          current_session_id: input.current_session_id,
          session_exercise_id: input.session_exercise_id,
          student_id: input.student_id,
          submitted: input.submitted,
          completion_status: input.completion_status,
          tutor_comments: input.tutor_comments,
          checked_by: input.checked_by,
          checked_at: nowIso,
        };
        if (idx === -1) return [...prev, next];
        const copy = prev.slice();
        copy[idx] = next;
        return copy;
      });

      // Flip / unflip the linked ChecktableAssignment based on submitted
      // state (grid chips are the existing source of truth for "done").
      setAssignments((prev) =>
        prev.map((a) => {
          if (
            a.sourceRecordedExerciseId !== input.session_exercise_id ||
            a.studentId !== input.student_id
          )
            return a;
          if (input.submitted) {
            return { ...a, status: "done", doneAt: nowIso };
          }
          // Re-marked as "Not done" — flip the assignment back to
          // "assigned" so the grid chip no longer reads as complete.
          return { ...a, status: "assigned", doneAt: undefined };
        })
      );
    },
    []
  );

  const createEnrollment = useCallback(
    (input: CreateEnrollmentInput): string => {
      const enrollmentId = newId("enr");
      const generated = generateSessions({
        enrollmentType: input.enrollment_type,
        firstLessonDate: input.first_lesson_date,
        assignedDay: input.assigned_day,
        lessonsPaid: input.lessons_paid,
      });
      const newEnrollment: Enrollment = {
        id: enrollmentId,
        student_id: input.student_id,
        tutor_id: input.tutor_id,
        tutor_name: input.tutor_name,
        lessons_total: input.lessons_paid,
        started_at: input.first_lesson_date,
        enrollment_type: input.enrollment_type,
        assigned_day: input.assigned_day,
        assigned_time: input.assigned_time,
        duration_mins: input.duration_mins,
        room: input.room,
        first_lesson_date: input.first_lesson_date,
        is_new_student: input.is_new_student,
        remark: input.remark,
      };

      const newSessions: Session[] = generated
        .filter((g): g is Extract<typeof g, { kind: "lesson" }> =>
          g.kind === "lesson"
        )
        .map((g) => ({
          id: `${newId("sess")}-${g.lesson_number}`,
          enrollment_id: enrollmentId,
          student_id: input.student_id,
          tutor_id: input.tutor_id,
          tutor_name: input.tutor_name,
          session_date: g.session_date,
          start_time: input.assigned_time,
          duration_mins: input.duration_mins,
          room: input.room,
          lesson_number: g.lesson_number,
          session_status: SessionStatus.SCHEDULED,
          cw: [],
          hw: [],
        }));

      setEnrollments((prev) => [...prev, newEnrollment]);
      setSessions((prev) => [...prev, ...newSessions]);
      return enrollmentId;
    },
    []
  );

  const createMakeupSession = useCallback(
    (input: {
      fromSessionId: string;
      studentId: string;
      template: {
        session_date: string;
        start_time: string;
        duration_mins: number;
        room: string;
        tutor_id: string;
        tutor_name: string;
      };
      reason?: string;
    }) => {
      const newSessionId = newId("s-mu");
      const source = sessionsRef.current.find(
        (s) => s.id === input.fromSessionId
      );
      const enrollmentId = source?.enrollment_id ?? "";
      const rootDate = source?.session_date;
      const noteParts = [
        source
          ? `Makeup for ${formatSessionLabel(source)} with ${source.tutor_name}`
          : null,
        input.reason ? `(${input.reason})` : null,
      ].filter(Boolean);

      const newSession: Session = {
        id: newSessionId,
        enrollment_id: enrollmentId,
        student_id: input.studentId,
        tutor_id: input.template.tutor_id,
        tutor_name: input.template.tutor_name,
        session_date: input.template.session_date,
        start_time: input.template.start_time,
        duration_mins: input.template.duration_mins,
        room: input.template.room,
        lesson_number: 0,
        session_status: SessionStatus.MAKEUP_CLASS,
        make_up_for_id: input.fromSessionId,
        root_original_session_date: rootDate,
        notes: noteParts.length > 0 ? noteParts.join(" ") : undefined,
        cw: [],
        hw: [],
      };

      setSessions((prev) => [
        ...prev.map((s) =>
          s.id !== input.fromSessionId
            ? s
            : {
                ...s,
                session_status: statusAfterMakeupBooked(s.session_status),
                rescheduled_to_id: newSessionId,
              }
        ),
        newSession,
      ]);

      return newSessionId;
    },
    []
  );

  const pendingPreviousHomework = useCallback(
    (studentId: string, currentSessionId: string): PendingHomeworkCheck | null => {
      const current = sessions.find((s) => s.id === currentSessionId);
      if (!current) return null;
      const currentKey = `${current.session_date}T${current.start_time}`;

      const priorAttended = sessions
        .filter(
          (s) =>
            s.student_id === studentId &&
            s.id !== currentSessionId &&
            (s.session_status === SessionStatus.ATTENDED ||
              s.session_status === SessionStatus.ATTENDED_MAKEUP) &&
            s.hw.length > 0 &&
            `${s.session_date}T${s.start_time}` < currentKey
        )
        .sort((a, b) => {
          if (a.session_date !== b.session_date)
            return b.session_date.localeCompare(a.session_date);
          return b.start_time.localeCompare(a.start_time);
        });

      const completionsByExerciseId = new Map<string, HomeworkCompletion>();
      for (const c of homeworkCompletions) {
        if (c.student_id !== studentId) continue;
        completionsByExerciseId.set(c.session_exercise_id, c);
      }

      for (const session of priorAttended) {
        const entries: PendingHomeworkEntry[] = [];
        for (const ex of session.hw) {
          const completion = completionsByExerciseId.get(ex.id);
          // No completion at all → still pending, show it.
          if (!completion) {
            entries.push({ exercise: ex });
            continue;
          }
          // Completion was recorded in *this* current session → keep it
          // visible so the tutor can see what they just marked (and
          // re-mark if needed).
          if (completion.current_session_id === currentSessionId) {
            entries.push({ exercise: ex, completion });
          }
          // Completion recorded in some other (later) session → suppress
          // here; it belongs in that session's row.
        }
        if (entries.length > 0) return { session, entries };
      }
      return null;
    },
    [sessions, homeworkCompletions]
  );

  const assignableSessions = useCallback((): AssignTarget[] => {
    const nameById = new Map(students.map((s) => [s.id, s.name]));
    return sessions
      .filter((s) => s.session_date >= DEMO_DAY)
      .sort((a, b) =>
        a.session_date !== b.session_date
          ? a.session_date.localeCompare(b.session_date)
          : a.start_time.localeCompare(b.start_time)
      )
      .map((s) => ({
        sessionId: s.id,
        label: formatSessionLabel(s),
        studentId: s.student_id,
        studentName: nameById.get(s.student_id) ?? s.student_id,
        tutorName: s.tutor_name,
      }));
  }, [sessions, students]);

  const primaryChecktableId = useCallback(
    (studentId: string) => {
      const counts = new Map<string, number>();
      for (const a of assignments) {
        if (a.studentId !== studentId) continue;
        counts.set(a.checktableId, (counts.get(a.checktableId) ?? 0) + 1);
      }
      let topId: string | null = null;
      let topCount = -1;
      for (const [id, count] of counts) {
        if (count > topCount) {
          topId = id;
          topCount = count;
        }
      }
      return topId ?? checktables[0].id;
    },
    [assignments, checktables]
  );

  const nextSuggestedItem = useCallback(
    (studentId: string, checktableId: string): NextSuggestion | null => {
      const table = checktables.find((t) => t.id === checktableId);
      if (!table) return null;
      const assigned = new Set(
        assignments
          .filter(
            (a) => a.studentId === studentId && a.checktableId === checktableId
          )
          .map((a) => a.itemId)
      );

      type ChapterBucket = { chapter: ChecktableChapter; items: ChecktableItem[] };
      const buckets: ChapterBucket[] = [];
      for (const sec of table.sections) {
        for (const ch of sec.chapters) {
          const items: ChecktableItem[] = [];
          for (const s of table.series) {
            items.push(...(ch.cells[s.id]?.items ?? []));
          }
          buckets.push({ chapter: ch, items });
        }
      }

      let startIndex = buckets.findIndex(({ items }) =>
        items.some((i) => assigned.has(i.id))
      );
      if (startIndex === -1) startIndex = 0;

      // R / P / PS are render-only notes (reading, project, problem set
      // header), not assignable items. ItemChip styles them italic; the
      // suggestion engine must skip them or it'd recommend "R" as next.
      const NON_ASSIGNABLE = new Set(["R", "P", "PS"]);

      for (let i = startIndex; i < buckets.length; i++) {
        const { chapter, items } = buckets[i];
        const next = items.find(
          (it) => !assigned.has(it.id) && !NON_ASSIGNABLE.has(it.code)
        );
        if (next) return { item: next, chapter, checktableId };
      }
      return null;
    },
    [assignments, checktables]
  );

  const value = useMemo<Store>(
    () => ({
      students,
      enrollments,
      checktables,
      sessions,
      assignments,
      homeworkCompletions,
      contacts,
      assessments,
      itemMeta,
      setSessions,
      setAssignments,
      setContacts,
      setAssessments,
      setAssessmentStage,
      recordExercise,
      removeExercise,
      recordHomeworkCompletion,
      getPrintBatch,
      togglePrintBatch,
      removeFromPrintBatch,
      clearPrintBatch,
      createEnrollment,
      createMakeupSession,
      pendingPreviousHomework,
      primaryChecktableId,
      nextSuggestedItem,
      sessionLabel,
      assignableSessions,
    }),
    [
      students,
      enrollments,
      checktables,
      sessions,
      assignments,
      homeworkCompletions,
      contacts,
      assessments,
      setAssessmentStage,
      itemMeta,
      recordExercise,
      removeExercise,
      recordHomeworkCompletion,
      getPrintBatch,
      togglePrintBatch,
      removeFromPrintBatch,
      clearPrintBatch,
      createEnrollment,
      createMakeupSession,
      pendingPreviousHomework,
      primaryChecktableId,
      nextSuggestedItem,
      sessionLabel,
      assignableSessions,
    ]
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function usePrimaryStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error(
      "usePrimaryStore must be used inside <PrimaryStoreProvider>"
    );
  }
  return ctx;
}
