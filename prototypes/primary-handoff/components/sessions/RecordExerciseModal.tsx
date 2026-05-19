"use client";

import { useEffect, useMemo, useState } from "react";
import { X, PenTool, Home as HomeIcon, Plus, Search } from "lucide-react";
import type {
  Checktable,
  ChecktableItem,
  ClassSession,
  RecordedExercise,
  SessionStudent,
  Student,
} from "@/lib/types";

type Props = {
  session: ClassSession;
  student: Student;
  sessionStudent: SessionStudent;
  kind: "CW" | "HW";
  checktables: Checktable[];
  onClose: () => void;
  onAdd: (input: {
    itemCode: string;
    itemId?: string;
    pageRange?: string;
    note?: string;
  }) => void;
  onRemove: (id: string) => void;
};

export function RecordExerciseModal({
  session,
  student,
  sessionStudent,
  kind,
  checktables,
  onClose,
  onAdd,
  onRemove,
}: Props) {
  const [checktableId, setChecktableId] = useState(checktables[0].id);
  const [search, setSearch] = useState("");
  const [pageRange, setPageRange] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const table = checktables.find((c) => c.id === checktableId)!;

  // Flatten all items in this checktable for picker
  const allItems = useMemo(() => {
    const items: { item: ChecktableItem; chapter: string }[] = [];
    for (const sec of table.sections) {
      for (const ch of sec.chapters) {
        for (const sId of Object.keys(ch.cells)) {
          for (const item of ch.cells[sId].items) {
            items.push({ item, chapter: `Ch.${ch.number} ${ch.title}` });
          }
        }
      }
    }
    for (const item of table.supplementary) {
      items.push({ item, chapter: "補充教材" });
    }
    return items;
  }, [table]);

  const filtered = useMemo(() => {
    if (!search) return allItems.slice(0, 60);
    const s = search.toLowerCase();
    return allItems
      .filter(
        ({ item, chapter }) =>
          item.code.toLowerCase().includes(s) ||
          chapter.toLowerCase().includes(s)
      )
      .slice(0, 60);
  }, [allItems, search]);

  const items = kind === "CW" ? sessionStudent.cw : sessionStudent.hw;
  const isCW = kind === "CW";

  const submit = (item: ChecktableItem) => {
    onAdd({
      itemCode: item.code,
      itemId: item.id,
      pageRange: pageRange || undefined,
      note: note || undefined,
    });
    setPageRange("");
    setNote("");
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-ink-900/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="surface w-full sm:max-w-3xl bg-white max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {isCW ? (
                <PenTool className="h-4 w-4 text-rose-600" />
              ) : (
                <HomeIcon className="h-4 w-4 text-blue-600" />
              )}
              <span className="text-lg font-semibold text-ink-900">
                Record {isCW ? "Classwork" : "Homework"}
              </span>
            </div>
            <div className="text-xs text-ink-500 mt-0.5 truncate">
              {student.name} · {student.code} · {session.className}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 -mr-2 p-2"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Already recorded */}
        {items.length > 0 && (
          <div className="px-5 py-3 border-b border-ink-100">
            <div className="text-xs uppercase tracking-wide text-ink-500 mb-2">
              Recorded so far ({items.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {items.map((it) => (
                <span
                  key={it.id}
                  className="inline-flex items-center gap-1 text-xs bg-ink-100 text-ink-700 rounded-md pl-2 pr-1 py-1"
                >
                  <span className="font-mono">{it.itemCode}</span>
                  {it.pageRange && (
                    <span className="text-ink-500">·{it.pageRange}</span>
                  )}
                  <button
                    onClick={() => onRemove(it.id)}
                    className="text-ink-400 hover:text-ink-800"
                    aria-label={`Remove ${it.itemCode}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Picker */}
        <div className="px-5 py-3 border-b border-ink-100 grid sm:grid-cols-[1fr_120px_1fr] gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wide text-ink-500 mb-1">
              Checktable
            </label>
            <select
              value={checktableId}
              onChange={(e) => setChecktableId(e.target.value)}
              className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm bg-white"
            >
              {checktables.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.textbook} · {c.grade} · {c.version}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-ink-500 mb-1">
              Page range
            </label>
            <input
              type="text"
              value={pageRange}
              onChange={(e) => setPageRange(e.target.value)}
              placeholder="1-2"
              className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-ink-500 mb-1">
              Note (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything specific for this student"
              className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="px-5 py-2 border-b border-ink-100 flex items-center gap-2">
          <Search className="h-4 w-4 text-ink-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code or chapter (e.g. 609, 圓周, supplementary)"
            className="flex-1 text-sm focus:outline-none"
          />
          <span className="text-xs text-ink-400">
            Showing {filtered.length} of {allItems.length}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
          {filtered.length === 0 && (
            <div className="text-center text-sm text-ink-500 py-8">
              No items match.
            </div>
          )}
          {filtered.length > 0 && (
            <ul className="divide-y divide-ink-100">
              {filtered.map(({ item, chapter }) => (
                <li
                  key={item.id}
                  className="py-2 flex items-center justify-between gap-3 hover:bg-ink-50 -mx-2 px-2 rounded-md"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-sm text-ink-800">
                      {item.code}
                    </div>
                    <div className="text-xs text-ink-500 truncate">
                      {chapter}
                    </div>
                  </div>
                  <button
                    onClick={() => submit(item)}
                    className="text-xs rounded-md border border-ink-300 hover:bg-ink-100 px-2 py-1 flex items-center gap-1 text-ink-700 whitespace-nowrap"
                  >
                    <Plus className="h-3 w-3" />
                    Record
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-ink-200 px-5 py-3 bg-ink-50 flex items-center justify-between text-xs text-ink-500">
          <div>
            Adds to the {kind} record for this student in this session. Also
            creates a checktable assignment so it shows up in the student's
            history.
          </div>
          <button
            onClick={onClose}
            className="rounded-md bg-ink-800 text-white px-3 py-1.5 text-sm font-medium hover:bg-ink-900"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
