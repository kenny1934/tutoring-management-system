"use client";

import { AlertCircle, Check, ArrowRight } from "lucide-react";
import type { ParentContact, Student } from "@/lib/types";
import { DEMO_NOW } from "@/lib/mock-data/parent-contacts";

type Props = {
  contacts: ParentContact[];
  students: Student[];
  onRecord: (studentId: string) => void;
  onMarkDone: (id: string) => void;
  onSelectStudent: (studentId: string) => void;
};

export function PendingFollowups({
  contacts,
  students,
  onRecord,
  onMarkDone,
  onSelectStudent,
}: Props) {
  const pending = contacts
    .filter((c) => c.followUpNeeded && !c.followUpDone)
    .sort((a, b) =>
      (a.followUpDate ?? "").localeCompare(b.followUpDate ?? "")
    );

  if (pending.length === 0) return null;

  const studentById = new Map(students.map((s) => [s.id, s]));
  const now = new Date(DEMO_NOW).getTime();

  return (
    <div className="surface p-3 border-l-4 border-l-amber-400">
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <div className="text-sm font-semibold text-ink-800">
          Pending follow-ups ({pending.length})
        </div>
      </div>
      <div className="space-y-2">
        {pending.map((c) => {
          const student = studentById.get(c.studentId);
          if (!student) return null;
          const due = c.followUpDate
            ? new Date(c.followUpDate).getTime()
            : null;
          const days = due
            ? Math.floor((due - now) / 86400000)
            : null;
          const urgency =
            days === null
              ? null
              : days < 0
                ? `Overdue ${Math.abs(days)}d`
                : days === 0
                  ? "Due today"
                  : `Due in ${days}d`;
          const urgencyCls =
            days === null
              ? "text-ink-500"
              : days < 0
                ? "text-rose-700 bg-rose-100"
                : days <= 2
                  ? "text-amber-700 bg-amber-100"
                  : "text-emerald-700 bg-emerald-100";

          return (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-2 sm:gap-3 bg-white border border-ink-200 rounded-md p-2 sm:p-3 text-sm"
            >
              <button
                onClick={() => onSelectStudent(c.studentId)}
                className="font-medium text-ink-900 hover:text-accent-600 truncate text-left"
              >
                {student.name}
              </button>
              <span className="text-xs text-ink-500 truncate flex-1">
                {c.briefNotes.slice(0, 80)}
                {c.briefNotes.length > 80 ? "…" : ""}
              </span>
              {urgency && (
                <span
                  className={`text-xs rounded-md px-2 py-0.5 font-medium ${urgencyCls}`}
                >
                  {urgency}
                </span>
              )}
              <div className="flex gap-1.5">
                <button
                  onClick={() => onRecord(c.studentId)}
                  className="text-xs rounded-md border border-ink-300 hover:bg-ink-100 px-2 py-1 text-ink-700 flex items-center gap-1"
                >
                  Record contact
                  <ArrowRight className="h-3 w-3" />
                </button>
                <button
                  onClick={() => onMarkDone(c.id)}
                  className="text-xs rounded-md bg-emerald-600 hover:bg-emerald-700 px-2 py-1 text-white flex items-center gap-1"
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                  Done
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
