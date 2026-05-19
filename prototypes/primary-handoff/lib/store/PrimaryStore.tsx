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
  Checktable,
  ChecktableAssignment,
  ChecktableChapter,
  ChecktableItem,
  ClassSession,
  ExerciseKind,
  ParentContact,
  RecordedExercise,
  Student,
} from "@/lib/types";
import { students as seedStudents } from "@/lib/mock-data/students";
import { checktables as seedChecktables } from "@/lib/mock-data/checktables";
import { seedAssignments } from "@/lib/mock-data/assignments";
import { sessions as seedSessions } from "@/lib/mock-data/sessions";
import { parentContacts as seedContacts } from "@/lib/mock-data/parent-contacts";

type ExerciseInput = {
  sessionId: string;
  studentId: string;
  kind: ExerciseKind;
  itemCode: string;
  itemId?: string;
  pageRange?: string;
  note?: string;
};

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

type Store = {
  students: Student[];
  checktables: Checktable[];
  sessions: ClassSession[];
  assignments: ChecktableAssignment[];
  contacts: ParentContact[];

  /** Lookup any item by id; carries its checktable id too. */
  itemMeta: Map<string, ItemMeta>;

  setSessions: (updater: (s: ClassSession[]) => ClassSession[]) => void;
  setAssignments: (
    updater: (a: ChecktableAssignment[]) => ChecktableAssignment[]
  ) => void;
  setContacts: (updater: (c: ParentContact[]) => ParentContact[]) => void;

  /** Record CW/HW for a student in a session. Also writes a ChecktableAssignment
   *  (status `done` for CW, `assigned` for HW) when the item links to a checktable. */
  recordExercise: (input: ExerciseInput) => void;
  /** Remove a recorded exercise; also removes the auto-linked assignment, if any. */
  removeExercise: (
    sessionId: string,
    studentId: string,
    kind: ExerciseKind,
    exerciseId: string
  ) => void;

  /** Items queued for printing, scoped per student so switching students
   *  shows that student's own batch. */
  getPrintBatch: (studentId: string) => string[];
  togglePrintBatch: (studentId: string, itemId: string) => void;
  removeFromPrintBatch: (studentId: string, itemId: string) => void;
  clearPrintBatch: (studentId: string) => void;

  /** Spawn a makeup ClassSession for a student missing a source session.
   *  Marks the source session's attendance for the student as "makeup" and
   *  returns the new session id. */
  createMakeupSession: (input: {
    fromSessionId: string;
    studentId: string;
    template: {
      classCode: string;
      className: string;
      startAt: string;
      durationMins: number;
      room: string;
      tutorName: string;
    };
    reason?: string;
  }) => string;

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
};

const StoreContext = createContext<Store | null>(null);

function formatSessionLabel(session: ClassSession): string {
  const d = new Date(session.startAt);
  const date = d.toISOString().slice(0, 10);
  const weekday = d.toLocaleDateString("en-HK", { weekday: "short" });
  const time = d.toLocaleTimeString("en-HK", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} ${weekday} ${time}`;
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

export function PrimaryStoreProvider({ children }: { children: ReactNode }) {
  const [students] = useState<Student[]>(seedStudents);
  const [checktables] = useState<Checktable[]>(seedChecktables);
  const [sessions, setSessions] = useState<ClassSession[]>(seedSessions);
  const [assignments, setAssignments] =
    useState<ChecktableAssignment[]>(seedAssignments);
  const [contacts, setContacts] = useState<ParentContact[]>(seedContacts);
  const [printBatchByStudent, setPrintBatchByStudent] = useState<
    Record<string, string[]>
  >({});

  const itemMeta = useMemo(() => buildItemMeta(checktables), [checktables]);

  // Keep recordExercise stable while still reading fresh sessions/itemMeta
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const itemMetaRef = useRef(itemMeta);
  itemMetaRef.current = itemMeta;

  const sessionLabel = useCallback((sessionId: string) => {
    const s = sessionsRef.current.find((x) => x.id === sessionId);
    return s ? formatSessionLabel(s) : "";
  }, []);

  const recordExercise = useCallback((input: ExerciseInput) => {
    const recordedId = `rec-${Math.random().toString(36).slice(2, 8)}`;
    const newExercise: RecordedExercise = {
      id: recordedId,
      kind: input.kind,
      itemCode: input.itemCode,
      itemId: input.itemId,
      pageRange: input.pageRange,
      note: input.note,
      sessionId: input.sessionId,
    };

    setSessions((prev) =>
      prev.map((s) =>
        s.id !== input.sessionId
          ? s
          : {
              ...s,
              students: s.students.map((st) => {
                if (st.studentId !== input.studentId) return st;
                const key = input.kind === "CW" ? "cw" : "hw";
                return { ...st, [key]: [...st[key], newExercise] };
              }),
            }
      )
    );

    if (!input.itemId) return;
    const meta = itemMetaRef.current.get(input.itemId);
    if (!meta) return;
    const checktableId = meta.checktableId;

    const sourceSession = sessionsRef.current.find(
      (s) => s.id === input.sessionId
    );
    const label = sourceSession ? formatSessionLabel(sourceSession) : "";
    const nowIso = new Date().toISOString();
    const status = input.kind === "CW" ? "done" : "assigned";

    setAssignments((prev) => {
      const existing = prev.find(
        (a) =>
          a.studentId === input.studentId &&
          a.checktableId === checktableId &&
          a.itemId === input.itemId
      );
      if (existing) {
        return prev.map((a) =>
          a.id === existing.id
            ? {
                ...a,
                status,
                pageRange: input.pageRange ?? a.pageRange,
                tutorNote: input.note ?? a.tutorNote,
                sessionLabel: label || a.sessionLabel,
                sessionId: input.sessionId,
                sourceRecordedExerciseId: recordedId,
                doneAt: status === "done" ? nowIso : a.doneAt,
              }
            : a
        );
      }
      const newAssignment: ChecktableAssignment = {
        id: `a-${Math.random().toString(36).slice(2, 8)}`,
        studentId: input.studentId,
        checktableId,
        itemId: input.itemId,
        status,
        assignedAt: nowIso,
        doneAt: status === "done" ? nowIso : undefined,
        pageRange: input.pageRange,
        tutorNote: input.note,
        sessionLabel: label,
        sessionId: input.sessionId,
        sourceRecordedExerciseId: recordedId,
      };
      return [...prev, newAssignment];
    });
  }, []);

  const removeExercise = useCallback(
    (
      sessionId: string,
      studentId: string,
      kind: ExerciseKind,
      exerciseId: string
    ) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id !== sessionId
            ? s
            : {
                ...s,
                students: s.students.map((st) => {
                  if (st.studentId !== studentId) return st;
                  const key = kind === "CW" ? "cw" : "hw";
                  return {
                    ...st,
                    [key]: st[key].filter((e) => e.id !== exerciseId),
                  };
                }),
              }
        )
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

  const createMakeupSession = useCallback(
    (input: {
      fromSessionId: string;
      studentId: string;
      template: {
        classCode: string;
        className: string;
        startAt: string;
        durationMins: number;
        room: string;
        tutorName: string;
      };
      reason?: string;
    }) => {
      const newId = `s-mu-${Math.random().toString(36).slice(2, 8)}`;
      const source = sessionsRef.current.find(
        (s) => s.id === input.fromSessionId
      );
      const fromLabel = source ? formatSessionLabel(source) : "";
      const rescheduledFrom = fromLabel
        ? `Makeup for ${source?.className ?? ""} on ${fromLabel}${
            input.reason ? ` (${input.reason})` : ""
          }`
        : input.reason
          ? `Makeup (${input.reason})`
          : "Makeup";

      const newSession: ClassSession = {
        id: newId,
        className: input.template.className,
        classCode: input.template.classCode,
        startAt: input.template.startAt,
        durationMins: input.template.durationMins,
        room: input.template.room,
        tutorName: input.template.tutorName,
        lessonNumber: 0,
        isMakeup: true,
        rescheduledFrom,
        students: [
          {
            studentId: input.studentId,
            attendance: "pending",
            cw: [],
            hw: [],
          },
        ],
      };

      setSessions((prev) => [
        ...prev.map((s) =>
          s.id !== input.fromSessionId
            ? s
            : {
                ...s,
                students: s.students.map((st) =>
                  st.studentId === input.studentId
                    ? { ...st, attendance: "makeup" as const }
                    : st
                ),
              }
        ),
        newSession,
      ]);

      return newId;
    },
    []
  );

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

      for (let i = startIndex; i < buckets.length; i++) {
        const { chapter, items } = buckets[i];
        const next = items.find((it) => !assigned.has(it.id));
        if (next) return { item: next, chapter, checktableId };
      }
      return null;
    },
    [assignments, checktables]
  );

  const value = useMemo<Store>(
    () => ({
      students,
      checktables,
      sessions,
      assignments,
      contacts,
      itemMeta,
      setSessions,
      setAssignments,
      setContacts,
      recordExercise,
      removeExercise,
      getPrintBatch,
      togglePrintBatch,
      removeFromPrintBatch,
      clearPrintBatch,
      createMakeupSession,
      primaryChecktableId,
      nextSuggestedItem,
      sessionLabel,
    }),
    [
      students,
      checktables,
      sessions,
      assignments,
      contacts,
      itemMeta,
      recordExercise,
      removeExercise,
      getPrintBatch,
      togglePrintBatch,
      removeFromPrintBatch,
      clearPrintBatch,
      createMakeupSession,
      primaryChecktableId,
      nextSuggestedItem,
      sessionLabel,
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
