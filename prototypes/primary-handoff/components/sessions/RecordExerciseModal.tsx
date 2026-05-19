"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  PenTool,
  Home as HomeIcon,
  Plus,
  Search,
  List as ListIcon,
  LayoutGrid,
} from "lucide-react";
import type {
  AssignmentStatus,
  Checktable,
  ChecktableItem,
  Session,
  Student,
} from "@/lib/types";
import {
  usePrimaryStore,
  parsePageRange,
  formatPageRange,
} from "@/lib/store/PrimaryStore";
import {
  ChecktableGrid,
  type GridStatusFilter,
} from "@/components/checktable/ChecktableGrid";

type Props = {
  session: Session;
  student: Student;
  kind: "CW" | "HW";
  checktables: Checktable[];
  onClose: () => void;
  onAdd: (input: {
    pdf_name: string;
    item_id?: string;
    page_start?: number;
    page_end?: number;
    remarks?: string;
  }) => void;
  onRemove: (id: string) => void;
};

type StatusFilter = "all" | "pending" | "untouched" | "hide-done";
type ViewMode = "list" | "grid";

const FILTER_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "untouched", label: "Untouched" },
  { id: "hide-done", label: "Hide done" },
];

function statusDotClasses(status: AssignmentStatus | null): string {
  if (status === "done") return "bg-emerald-500";
  if (status === "assigned") return "bg-amber-400";
  return "bg-ink-200";
}

function statusLabel(status: AssignmentStatus | null): string {
  if (status === "done") return "Done";
  if (status === "assigned") return "Assigned";
  return "Untouched";
}

function toGridStatusFilter(f: StatusFilter): GridStatusFilter {
  // The grid's filter has three modes; "hide-done" collapses to "all" since
  // done items are still rendered (just visually marked) and the row-level
  // filter wouldn't hide them.
  if (f === "pending" || f === "untouched") return f;
  return "all";
}

export function RecordExerciseModal({
  session,
  student,
  kind,
  checktables,
  onClose,
  onAdd,
  onRemove,
}: Props) {
  const { assignments } = usePrimaryStore();
  const [checktableId, setChecktableId] = useState(checktables[0].id);
  const [search, setSearch] = useState("");
  const [pageRange, setPageRange] = useState("");
  const [note, setNote] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const table = checktables.find((c) => c.id === checktableId)!;

  const statusByItemId = useMemo(() => {
    const map: Record<string, AssignmentStatus | null> = {};
    for (const a of assignments) {
      if (a.studentId === student.id && a.checktableId === checktableId) {
        map[a.itemId] = a.status;
      }
    }
    return map;
  }, [assignments, student.id, checktableId]);

  const noteByItemId = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const a of assignments) {
      if (
        a.studentId === student.id &&
        a.checktableId === checktableId &&
        a.tutorNote
      ) {
        map[a.itemId] = a.tutorNote;
      }
    }
    return map;
  }, [assignments, student.id, checktableId]);

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

  const counts = useMemo(() => {
    let done = 0;
    let assigned = 0;
    let untouched = 0;
    for (const { item } of allItems) {
      const s = statusByItemId[item.id] ?? null;
      if (s === "done") done += 1;
      else if (s === "assigned") assigned += 1;
      else untouched += 1;
    }
    return { done, assigned, untouched, total: allItems.length };
  }, [allItems, statusByItemId]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    const matches = allItems.filter(({ item, chapter }) => {
      const status = statusByItemId[item.id] ?? null;
      if (statusFilter === "pending" && status !== "assigned") return false;
      if (statusFilter === "untouched" && status !== null) return false;
      if (statusFilter === "hide-done" && status === "done") return false;
      if (s) {
        return (
          item.code.toLowerCase().includes(s) ||
          chapter.toLowerCase().includes(s)
        );
      }
      return true;
    });
    return matches.slice(0, 60);
  }, [allItems, search, statusFilter, statusByItemId]);

  const items = kind === "CW" ? session.cw : session.hw;
  const isCW = kind === "CW";
  const isGrid = viewMode === "grid";

  const submit = (item: ChecktableItem) => {
    const { page_start, page_end } = parsePageRange(pageRange);
    onAdd({
      pdf_name: item.code,
      item_id: item.id,
      page_start,
      page_end,
      remarks: note || undefined,
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
              {student.name} · {student.code} · {session.class_name}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="inline-flex rounded-md border border-ink-200 bg-white p-0.5 text-xs"
              role="tablist"
              aria-label="Picker view mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!isGrid}
                onClick={() => setViewMode("list")}
                className={`px-2 py-1 rounded-md flex items-center gap-1 ${
                  !isGrid
                    ? "bg-ink-800 text-white"
                    : "text-ink-600 hover:bg-ink-100"
                }`}
              >
                <ListIcon className="h-3 w-3" />
                List
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isGrid}
                onClick={() => setViewMode("grid")}
                className={`px-2 py-1 rounded-md flex items-center gap-1 ${
                  isGrid
                    ? "bg-ink-800 text-white"
                    : "text-ink-600 hover:bg-ink-100"
                }`}
              >
                <LayoutGrid className="h-3 w-3" />
                Grid
              </button>
            </div>
            <button
              onClick={onClose}
              className="text-ink-400 hover:text-ink-700 -mr-2 p-2"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Already recorded */}
        {items.length > 0 && (
          <div className="px-5 py-3 border-b border-ink-100">
            <div className="text-xs uppercase tracking-wide text-ink-500 mb-2">
              Recorded so far ({items.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {items.map((it) => {
                const range = formatPageRange(it.page_start, it.page_end);
                return (
                  <span
                    key={it.id}
                    className="inline-flex items-center gap-1 text-xs bg-ink-100 text-ink-700 rounded-md pl-2 pr-1 py-1"
                  >
                    <span className="font-mono">{it.pdf_name}</span>
                    {range && <span className="text-ink-500">·{range}</span>}
                    <button
                      onClick={() => onRemove(it.id)}
                      className="text-ink-400 hover:text-ink-800"
                      aria-label={`Remove ${it.pdf_name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
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

        <div className="px-5 py-2 border-b border-ink-100 flex flex-wrap items-center gap-2">
          {!isGrid && (
            <>
              <Search className="h-4 w-4 text-ink-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by code or chapter (e.g. 609, 圓周, supplementary)"
                className="flex-1 min-w-[160px] text-sm focus:outline-none"
              />
            </>
          )}
          {isGrid && (
            <span className="text-xs text-ink-500">
              Tap any chip to record it. Page range and note apply to each
              record.
            </span>
          )}
          <div
            className="inline-flex rounded-md border border-ink-200 bg-white p-0.5 text-xs ml-auto"
            role="tablist"
            aria-label="Filter items by status"
          >
            {FILTER_OPTIONS.map((opt) => {
              // "Hide done" only changes list visibility — skip it in grid
              // mode where rows still render done items for context.
              if (isGrid && opt.id === "hide-done") return null;
              const active = statusFilter === opt.id;
              const count =
                opt.id === "all"
                  ? counts.total
                  : opt.id === "pending"
                    ? counts.assigned
                    : opt.id === "untouched"
                      ? counts.untouched
                      : counts.total - counts.done;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatusFilter(opt.id)}
                  className={`px-2 py-0.5 rounded-md ${
                    active
                      ? "bg-ink-800 text-white"
                      : "text-ink-600 hover:bg-ink-100"
                  }`}
                >
                  {opt.label}
                  <span
                    className={`ml-1 ${active ? "opacity-80" : "text-ink-400"}`}
                  >
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>
          {!isGrid && (
            <span className="text-xs text-ink-400">
              Showing {filtered.length}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {isGrid ? (
            <div className="px-5 py-3">
              <ChecktableGrid
                table={table}
                statusByItemId={statusByItemId}
                noteByItemId={noteByItemId}
                selectedItemIds={EMPTY_SELECTION}
                statusFilter={toGridStatusFilter(statusFilter)}
                onItemClick={submit}
              />
            </div>
          ) : (
            <div className="px-5 py-3">
              {filtered.length === 0 && (
                <div className="text-center text-sm text-ink-500 py-8">
                  No items match.
                </div>
              )}
              {filtered.length > 0 && (
                <ul className="divide-y divide-ink-100">
                  {filtered.map(({ item, chapter }) => {
                    const status = statusByItemId[item.id] ?? null;
                    return (
                      <li
                        key={item.id}
                        className="py-2 flex items-center justify-between gap-3 hover:bg-ink-50 -mx-2 px-2 rounded-md"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${statusDotClasses(status)}`}
                            title={statusLabel(status)}
                            aria-label={statusLabel(status)}
                          />
                          <div className="min-w-0">
                            <div className="font-mono text-sm text-ink-800">
                              {item.code}
                            </div>
                            <div className="text-xs text-ink-500 truncate">
                              {chapter}
                              {status && (
                                <span
                                  className={`ml-1.5 font-medium ${
                                    status === "done"
                                      ? "text-emerald-700"
                                      : "text-amber-700"
                                  }`}
                                >
                                  · {statusLabel(status)}
                                </span>
                              )}
                            </div>
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
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        <footer className="border-t border-ink-200 px-5 py-3 bg-ink-50 flex items-center justify-between text-xs text-ink-500">
          <div>
            Adds to the {kind} record for this student in this session. Also
            creates a checktable assignment so it shows up in the student&apos;s
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

const EMPTY_SELECTION: Set<string> = new Set();
