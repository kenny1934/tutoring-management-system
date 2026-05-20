"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  PenTool,
  Home as HomeIcon,
  Plus,
  Search,
  List as ListIcon,
  LayoutGrid,
  Check,
  Circle,
  CircleDashed,
  CircleCheck,
  type LucideIcon,
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

function statusIcon(status: AssignmentStatus | null): {
  Icon: LucideIcon;
  className: string;
} {
  // Distinct silhouettes (filled-check / dashed / outline) so the three
  // states are still readable at the small size we use in the list — pure
  // color dots blurred together at 8px.
  if (status === "done")
    return { Icon: CircleCheck, className: "text-emerald-600" };
  if (status === "assigned")
    return { Icon: CircleDashed, className: "text-amber-500" };
  return { Icon: Circle, className: "text-ink-300" };
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
  // Auto-pick a checktable that matches the student's grade. Falls back to
  // the first one (CSM has no "primary checktable" link on the student
  // record itself; the prototype just heuristics on grade text match).
  const initialChecktableId = useMemo(() => {
    const match = checktables.find((c) => c.grade === student.grade);
    return (match ?? checktables[0]).id;
  }, [checktables, student.grade]);
  const [checktableId, setChecktableId] = useState(initialChecktableId);
  const [search, setSearch] = useState("");
  const [pageRange, setPageRange] = useState("");
  const [note, setNote] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  // Briefly-set id for the row that just got recorded; drives a green flash
  // so the tutor visibly sees the click landed without scrolling.
  const [flashItemId, setFlashItemId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Forgive common range formats before validating: strip "p." prefixes,
  // normalize en/em dashes, accept "5 to 10", and collapse whitespace.
  // parsePageRange is strict (^\d+(-\d+)?$); we hand it a clean string.
  const normalizedRange = pageRange
    .trim()
    .replace(/^p\.?\s*/i, "")
    .replace(/[–—]/g, "-")
    .replace(/\s*to\s*/i, "-")
    .replace(/\s+/g, "");

  const pageRangeIsInvalid =
    pageRange.trim().length > 0 &&
    !/^\d+-\d+$|^\d+$/.test(normalizedRange);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  // Reset search whenever the tutor switches checktables — a query that
  // matched items in the old table almost never matches the new one.
  useEffect(() => {
    setSearch("");
  }, [checktableId]);

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

  // Set of checktable-item ids already recorded *in this session's CW/HW
  // list*. Drives the inline "Recorded" pill on list rows so the tutor can
  // see at a glance which items are already in.
  const recordedItemIds = useMemo(
    () =>
      new Set(
        items
          .map((it) => it.item_id)
          .filter((id): id is string => typeof id === "string")
      ),
    [items]
  );

  const submit = (item: ChecktableItem) => {
    if (pageRangeIsInvalid) return;
    const { page_start, page_end } = parsePageRange(normalizedRange);
    onAdd({
      pdf_name: item.code,
      item_id: item.id,
      page_start,
      page_end,
      remarks: note || undefined,
    });
    setFlashItemId(item.id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      setFlashItemId((cur) => (cur === item.id ? null : cur));
    }, 900);
    // Keep pageRange and note so the tutor can record several PDFs from
    // the same range in one go without retyping.
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
              {student.name} · {student.code} · {session.session_date}{" "}
              {session.start_time} · {session.tutor_name}
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

        {/* Picker controls */}
        <div className="px-5 py-3 border-b border-ink-100 grid sm:grid-cols-[1fr_140px_1fr] gap-3">
          <div>
            <label className="block text-xs text-ink-500 mb-1">
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
            <label className="block text-xs text-ink-500 mb-1">
              Page range
            </label>
            <input
              type="text"
              value={pageRange}
              onChange={(e) => setPageRange(e.target.value)}
              placeholder="e.g. 5 or 1-3"
              aria-invalid={pageRangeIsInvalid || undefined}
              className={`w-full rounded-md border px-2 py-1.5 text-sm ${
                pageRangeIsInvalid
                  ? "border-mc-red-500 focus:border-mc-red-600"
                  : "border-ink-200"
              }`}
            />
            {pageRangeIsInvalid && (
              <div className="text-[10px] text-mc-red-600 mt-1">
                Use "5" or "1-3"
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-ink-500 mb-1">
              Note <span className="text-ink-400">(optional)</span>
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

        {/* Browse controls: search + filter + view toggle.
         *  View toggle moved out of the header so it sits next to the
         *  picker it actually affects. */}
        <div className="px-5 py-2 border-b border-ink-100 flex flex-wrap items-center gap-2">
          {!isGrid && (
            <>
              <Search className="h-4 w-4 text-ink-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  // Enter records the top filtered hit so a tutor can search
                  // → enter to capture without reaching for the mouse.
                  if (e.key === "Enter" && filtered.length > 0) {
                    e.preventDefault();
                    submit(filtered[0].item);
                  }
                }}
                placeholder="Search by code or chapter — press Enter to record top hit"
                className="flex-1 min-w-[160px] text-sm focus:outline-none"
              />
            </>
          )}
          {isGrid && (
            <span className="text-xs text-ink-500">
              Tap any chip to record it. Page range and note apply to each.
            </span>
          )}
          <div
            className="inline-flex rounded-md border border-ink-200 bg-white p-0.5 text-xs ml-auto"
            role="tablist"
            aria-label="Filter items by status"
          >
            {FILTER_OPTIONS.map((opt) => {
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
              className={`px-2 py-0.5 rounded-md flex items-center gap-1 ${
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
              className={`px-2 py-0.5 rounded-md flex items-center gap-1 ${
                isGrid
                  ? "bg-ink-800 text-white"
                  : "text-ink-600 hover:bg-ink-100"
              }`}
            >
              <LayoutGrid className="h-3 w-3" />
              Grid
            </button>
          </div>
          {!isGrid && (
            <span className="text-xs text-ink-400 w-full sm:w-auto">
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
                    const isRecorded = recordedItemIds.has(item.id);
                    const isFlashing = flashItemId === item.id;
                    const { Icon: StatusIcon, className: statusCls } =
                      statusIcon(status);
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => submit(item)}
                          disabled={pageRangeIsInvalid}
                          title={
                            pageRangeIsInvalid
                              ? "Fix the page range first"
                              : "Click to record"
                          }
                          className={`group w-full -mx-2 px-2 py-2 rounded-md flex items-center justify-between gap-3 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            isFlashing
                              ? "bg-emerald-100"
                              : "hover:bg-ink-50 focus-visible:bg-ink-50 outline-none"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <StatusIcon
                              className={`h-3.5 w-3.5 shrink-0 ${statusCls}`}
                              strokeWidth={2.25}
                              aria-label={statusLabel(status)}
                            />
                            <div className="min-w-0">
                              <div className="font-mono text-sm text-ink-800 flex items-center gap-1.5">
                                {item.code}
                                {isRecorded && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-700">
                                    <Check className="h-2.5 w-2.5" />
                                    Recorded
                                  </span>
                                )}
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
                          {/* Hover-revealed affordance instead of a wall of
                           *  visible buttons. Kept text + icon so the
                           *  interaction is clear when hovered or focused. */}
                          <span
                            className={`text-xs text-ink-500 flex items-center gap-1 whitespace-nowrap transition-opacity ${
                              isFlashing
                                ? "opacity-100 text-emerald-700 font-medium"
                                : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                            }`}
                          >
                            {isFlashing ? (
                              <>
                                <Check className="h-3 w-3" />
                                Recorded
                              </>
                            ) : (
                              <>
                                <Plus className="h-3 w-3" />
                                Record
                              </>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Recorded-so-far strip. Lives just above the footer so it stays
         *  visible while the tutor scrolls the picker and accumulates near
         *  the close action. Empty when nothing recorded yet. */}
        {items.length > 0 && (
          <div className="border-t border-ink-100 px-5 py-2 bg-ink-50/60 flex items-start gap-2">
            <span className="text-xs text-ink-500 shrink-0 pt-1">
              Recorded{" "}
              <span className="text-ink-400 tabular-nums">
                ({items.length})
              </span>
            </span>
            <div className="flex flex-wrap gap-1.5 min-w-0">
              {items.map((it) => {
                const range = formatPageRange(it.page_start, it.page_end);
                return (
                  <span
                    key={it.id}
                    className="inline-flex items-center gap-1 text-xs bg-white border border-ink-200 text-ink-700 rounded-md pl-2 pr-1 py-0.5"
                  >
                    <span className="font-mono">{it.pdf_name}</span>
                    {range && <span className="text-ink-400">·{range}</span>}
                    <button
                      onClick={() => onRemove(it.id)}
                      className="text-ink-300 hover:text-ink-700"
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

        <footer className="border-t border-ink-200 px-5 py-3 flex items-center justify-end">
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
