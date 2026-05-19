"use client";

import { X, Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ChecktableAssignment, Student, Checktable } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  student: Student;
  assignments: ChecktableAssignment[];
  checktables: Checktable[];
};

export function HistoryDrawer({
  open,
  onClose,
  student,
  assignments,
  checktables,
}: Props) {
  if (!open) return null;

  // Newest first
  const sorted = [...assignments].sort((a, b) =>
    b.assignedAt.localeCompare(a.assignedAt)
  );

  const tableLabel = (id: string) => {
    const t = checktables.find((c) => c.id === id);
    return t ? `${t.textbook} ${t.grade} ${t.version}` : id;
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-ink-900/40"
      onClick={onClose}
    >
      <div
        className="absolute top-0 right-0 h-full w-full sm:w-[480px] bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-white border-b border-ink-200 px-5 py-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-ink-900">
              Exercise history
            </div>
            <div className="text-xs text-ink-500">
              {student.name} · all checktables
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

        <div className="p-4 space-y-2">
          {sorted.length === 0 && (
            <div className="text-sm text-ink-500 text-center py-8">
              No exercises assigned yet.
            </div>
          )}
          {sorted.map((a) => (
            <div key={a.id} className="surface-muted p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-ink-800 text-sm">
                  {a.itemId.split("/").pop()}
                </div>
                {a.status === "done" ? (
                  <span className="text-xs rounded-md bg-good text-white px-2 py-0.5 flex items-center gap-1">
                    <Check className="h-3 w-3" strokeWidth={3} />
                    Done
                  </span>
                ) : (
                  <span className="text-xs rounded-md bg-accent-100 text-accent-700 px-2 py-0.5">
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
                    className="text-accent-700 hover:underline inline-flex items-center gap-1"
                    title="Open the session this was recorded in"
                  >
                    {a.sessionLabel ??
                      new Date(a.assignedAt).toLocaleDateString()}
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
