"use client";

import { useMemo, useState } from "react";
import { X, Check, ExternalLink, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import type {
  ChecktableAssignment,
  HomeworkCompletion,
  Student,
  Checktable,
} from "@/lib/types";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";

type Props = {
  open: boolean;
  onClose: () => void;
  student: Student;
  assignments: ChecktableAssignment[];
  checktables: Checktable[];
};

type GroupMode = "date" | "chapter" | "session";

const GROUP_OPTIONS: { id: GroupMode; label: string }[] = [
  { id: "date", label: "By date" },
  { id: "chapter", label: "By chapter" },
  { id: "session", label: "By session" },
];

export function HistoryDrawer({
  open,
  onClose,
  student,
  assignments,
  checktables,
}: Props) {
  const { itemMeta, homeworkCompletions, sessionLabel } = usePrimaryStore();
  const [groupBy, setGroupBy] = useState<GroupMode>("date");

  /** Map a ChecktableAssignment's source exercise id to its completion. */
  const completionByExerciseId = useMemo(() => {
    const map = new Map<string, HomeworkCompletion>();
    for (const c of homeworkCompletions) {
      if (c.student_id !== student.id) continue;
      map.set(c.session_exercise_id, c);
    }
    return map;
  }, [homeworkCompletions, student.id]);

  const tableLabel = (id: string) => {
    const t = checktables.find((c) => c.id === id);
    return t ? `${t.textbook} ${t.grade} ${t.version}` : id;
  };

  const sorted = useMemo(
    () =>
      [...assignments].sort((a, b) =>
        b.assignedAt.localeCompare(a.assignedAt)
      ),
    [assignments]
  );

  const groups = useMemo(() => {
    type Group = { key: string; label: string; items: ChecktableAssignment[] };
    const map = new Map<string, Group>();

    const push = (key: string, label: string, a: ChecktableAssignment) => {
      const existing = map.get(key);
      if (existing) existing.items.push(a);
      else map.set(key, { key, label, items: [a] });
    };

    for (const a of sorted) {
      if (groupBy === "date") {
        const d = (a.doneAt ?? a.assignedAt).slice(0, 10);
        push(d, d, a);
      } else if (groupBy === "chapter") {
        const meta = itemMeta.get(a.itemId);
        if (meta?.chapter) {
          const key = `${meta.checktableId}/${meta.chapter.id}`;
          const label = `Ch.${meta.chapter.number} ${meta.chapter.title}`;
          push(key, label, a);
        } else {
          push("supp", "補充教材", a);
        }
      } else {
        const key = a.sessionId ?? a.sessionLabel ?? "no-session";
        const label = a.sessionLabel ?? "Unlinked";
        push(key, label, a);
      }
    }

    return Array.from(map.values());
  }, [sorted, groupBy, itemMeta]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-ink-900/40" onClick={onClose}>
      <div
        className="absolute top-0 right-0 h-full w-full sm:w-[480px] bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-white border-b border-ink-200 px-5 py-3 flex items-center justify-between z-10">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink-900">
              Exercise history
            </div>
            <div className="text-xs text-ink-500 truncate">
              {student.name} · all checktables · {sorted.length} entries
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 p-2 -mr-2"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="sticky top-[57px] bg-white border-b border-ink-100 px-5 py-2 z-10">
          <div
            className="inline-flex rounded-md border border-ink-200 bg-white p-0.5 text-xs"
            role="tablist"
            aria-label="Group history by"
          >
            {GROUP_OPTIONS.map((opt) => {
              const active = groupBy === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setGroupBy(opt.id)}
                  className={`px-2 py-0.5 rounded-md ${
                    active
                      ? "bg-ink-800 text-white"
                      : "text-ink-600 hover:bg-ink-100"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 space-y-4">
          {groups.length === 0 && (
            <div className="text-sm text-ink-500 text-center py-8">
              No exercises assigned yet.
            </div>
          )}
          {groups.map((group) => (
            <section key={group.key} className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-ink-500">
                <span>{group.label}</span>
                <span className="text-ink-400 normal-case tracking-normal">
                  {group.items.length}
                </span>
              </div>
              <div className="space-y-2">
                {group.items.map((a) => (
                  <AssignmentCard
                    key={a.id}
                    assignment={a}
                    tableLabel={tableLabel}
                    sessionLabel={sessionLabel}
                    completion={
                      a.sourceRecordedExerciseId
                        ? completionByExerciseId.get(
                            a.sourceRecordedExerciseId
                          )
                        : undefined
                    }
                    itemCode={
                      itemMeta.get(a.itemId)?.item.code ??
                      a.itemId.split("/").pop()
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function AssignmentCard({
  assignment: a,
  tableLabel,
  sessionLabel,
  completion,
  itemCode,
}: {
  assignment: ChecktableAssignment;
  tableLabel: (id: string) => string;
  sessionLabel: (sessionId: string) => string;
  completion?: HomeworkCompletion;
  itemCode: string | undefined;
}) {
  return (
    <div className="surface-muted p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-ink-800 text-sm">{itemCode}</div>
        {a.status === "done" ? (
          <span className="text-xs rounded-md bg-good text-white px-2 py-0.5 flex items-center gap-1">
            <Check className="h-3 w-3" strokeWidth={3} />
            Done
          </span>
        ) : (
          <span className="text-xs rounded-md bg-amber-100 text-amber-800 px-2 py-0.5">
            Assigned
          </span>
        )}
      </div>
      <div className="text-xs text-ink-500 mt-1">
        {tableLabel(a.checktableId)}
      </div>
      <div className="text-xs text-ink-500 mt-0.5">
        {a.sessionId ? (
          <Link
            href={`/sessions?session=${a.sessionId}`}
            className="text-mc-red-700 hover:underline inline-flex items-center gap-1"
            title="Open the session this was recorded in"
          >
            {a.sessionLabel ?? new Date(a.assignedAt).toLocaleDateString()}
            <ExternalLink className="h-3 w-3" />
          </Link>
        ) : (
          a.sessionLabel ?? new Date(a.assignedAt).toLocaleDateString()
        )}
        {a.pageRange && ` · pp. ${a.pageRange}`}
      </div>
      {a.tutorNote && (
        <div className="text-xs text-ink-600 mt-1.5 italic">
          &ldquo;{a.tutorNote}&rdquo;
        </div>
      )}
      {completion && (
        <div className="text-xs text-emerald-700 mt-1.5 flex items-start gap-1.5">
          <ClipboardCheck className="h-3 w-3 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <Link
              href={`/sessions?session=${completion.current_session_id}`}
              className="hover:underline"
              title="Open the session where this was checked"
            >
              {completion.completion_status ?? "Submitted"} in{" "}
              {sessionLabel(completion.current_session_id) ||
                "previous session"}
            </Link>
            {completion.tutor_comments && (
              <div className="text-ink-500 italic mt-0.5">
                &ldquo;{completion.tutor_comments}&rdquo;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
