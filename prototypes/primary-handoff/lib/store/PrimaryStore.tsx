"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  Checktable,
  ChecktableAssignment,
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

type Store = {
  students: Student[];
  checktables: Checktable[];
  sessions: ClassSession[];
  assignments: ChecktableAssignment[];
  contacts: ParentContact[];

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

  /** Helper — find which checktable contains a given item id. */
  findChecktableForItem: (itemId: string) => string | null;
  /** Helper — format a session as a human label. */
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

function buildItemIndex(
  checktables: Checktable[]
): Map<string, string> {
  const index = new Map<string, string>();
  for (const t of checktables) {
    const collect = (item: ChecktableItem) => index.set(item.id, t.id);
    for (const sec of t.sections) {
      for (const ch of sec.chapters) {
        for (const sId of Object.keys(ch.cells)) {
          ch.cells[sId].items.forEach(collect);
        }
      }
    }
    t.supplementary.forEach(collect);
  }
  return index;
}

export function PrimaryStoreProvider({ children }: { children: ReactNode }) {
  const [students] = useState<Student[]>(seedStudents);
  const [checktables] = useState<Checktable[]>(seedChecktables);
  const [sessions, setSessionsState] = useState<ClassSession[]>(seedSessions);
  const [assignments, setAssignmentsState] =
    useState<ChecktableAssignment[]>(seedAssignments);
  const [contacts, setContactsState] = useState<ParentContact[]>(seedContacts);

  const itemIndex = useMemo(() => buildItemIndex(checktables), [checktables]);

  const findChecktableForItem = (itemId: string) =>
    itemIndex.get(itemId) ?? null;

  const sessionLabel = (sessionId: string) => {
    const s = sessions.find((x) => x.id === sessionId);
    return s ? formatSessionLabel(s) : "";
  };

  const recordExercise = (input: ExerciseInput) => {
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

    setSessionsState((prev) =>
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
    const checktableId = findChecktableForItem(input.itemId);
    if (!checktableId) return;

    const sourceSession = sessions.find((s) => s.id === input.sessionId);
    const label = sourceSession ? formatSessionLabel(sourceSession) : "";
    const nowIso = new Date().toISOString();
    const status = input.kind === "CW" ? "done" : "assigned";

    setAssignmentsState((prev) => {
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
  };

  const removeExercise = (
    sessionId: string,
    studentId: string,
    kind: ExerciseKind,
    exerciseId: string
  ) => {
    setSessionsState((prev) =>
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
    setAssignmentsState((prev) =>
      prev.filter((a) => a.sourceRecordedExerciseId !== exerciseId)
    );
  };

  const value: Store = {
    students,
    checktables,
    sessions,
    assignments,
    contacts,
    setSessions: setSessionsState,
    setAssignments: setAssignmentsState,
    setContacts: setContactsState,
    recordExercise,
    removeExercise,
    findChecktableForItem,
    sessionLabel,
  };

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
