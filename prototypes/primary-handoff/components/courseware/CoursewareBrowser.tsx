"use client";

import { useMemo, useState } from "react";
import { Library, CheckCircle2, Search, X } from "lucide-react";
import type {
  AssignmentStatus,
  Checktable,
  ChecktableItem,
} from "@/lib/types";
import { usePrimaryStore, parsePageRange } from "@/lib/store/PrimaryStore";
import { ChecktableGrid } from "@/components/checktable/ChecktableGrid";
import {
  AssignDialog,
  type SessionPick,
} from "@/components/checktable/AssignDialog";

const EMPTY_SELECTION = new Set<string>();
// Neutral status map: courseware chips carry no per-student progress.
const EMPTY_STATUS: Record<string, AssignmentStatus | null> = {};

/** Build a search-filtered copy of a checktable, keeping only items whose code
 *  or chapter title matches the query. Empty rows/sections are dropped so the
 *  grid stays compact. Returns the original table when the query is empty. */
function filterTableBySearch(table: Checktable, query: string): Checktable {
  const q = query.trim().toLowerCase();
  if (!q) return table;

  const matchItem = (item: ChecktableItem, chapterTitle: string) =>
    item.code.toLowerCase().includes(q) ||
    chapterTitle.toLowerCase().includes(q);

  const sections = table.sections
    .map((sec) => {
      const chapters = sec.chapters
        .map((ch) => {
          const cells: typeof ch.cells = {};
          for (const sId of Object.keys(ch.cells)) {
            const items = ch.cells[sId].items.filter((it) =>
              matchItem(it, ch.title)
            );
            if (items.length > 0) cells[sId] = { items };
          }
          return Object.keys(cells).length > 0 ? { ...ch, cells } : null;
        })
        .filter((ch): ch is NonNullable<typeof ch> => ch !== null);
      return chapters.length > 0 ? { ...sec, chapters } : null;
    })
    .filter((sec): sec is NonNullable<typeof sec> => sec !== null);

  const supplementary = table.supplementary.filter((it) =>
    matchItem(it, "補充教材 Supplementary")
  );

  return { ...table, sections, supplementary };
}

function countItems(t: Checktable): number {
  let n = t.supplementary.length;
  for (const sec of t.sections) {
    for (const ch of sec.chapters) {
      for (const s of t.series) n += ch.cells[s.id]?.items.length ?? 0;
    }
  }
  return n;
}

/** Short pill label from a level's full label: "Math 1 to 6 Level 1" -> "Level 1",
 *  "First Step(Stage 1)" -> "Stage 1", "Little First Step / N1" -> "N1". */
function shortLevel(levelLabel: string): string {
  return (
    levelLabel.match(/Level\s*\d+/i)?.[0] ??
    levelLabel.match(/Stage\s*\d+/i)?.[0] ??
    levelLabel.match(/\bN\d+\b/)?.[0] ??
    levelLabel.split("/").pop()!.trim()
  );
}

export function CoursewareBrowser() {
  const { checktables, assignableSessions, recordExercise } =
    usePrimaryStore();

  const mcTables = useMemo(
    () => checktables.filter((c) => c.source === "mc-drive"),
    [checktables]
  );

  // Group level-checktables under their product-line family, preserving the
  // generator's order (SG, Math 1-6, PS, Kindergarten, CA).
  const families = useMemo(() => {
    const map = new Map<string, Checktable[]>();
    for (const t of mcTables) {
      const key = t.family ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return [...map.entries()];
  }, [mcTables]);

  const [family, setFamily] = useState(families[0]?.[0] ?? "");
  const levels = useMemo(
    () => families.find(([f]) => f === family)?.[1] ?? [],
    [families, family]
  );
  const [selectedId, setSelectedId] = useState(families[0]?.[1][0]?.id ?? "");

  // Keep the selected level inside the active family.
  const table =
    levels.find((t) => t.id === selectedId) ?? levels[0];
  const worksheetCount = useMemo(() => (table ? countItems(table) : 0), [table]);

  const pickFamily = (f: string) => {
    setFamily(f);
    setSearch("");
    const first = families.find(([name]) => name === f)?.[1][0];
    if (first) setSelectedId(first.id);
  };

  const pickLevel = (id: string) => {
    setSelectedId(id);
    setSearch("");
  };

  const [activeItem, setActiveItem] = useState<ChecktableItem | null>(null);
  const targets = useMemo(() => assignableSessions(), [assignableSessions]);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Filtered view of the active checktable for the code/chapter search.
  const filteredTable = useMemo(
    () => (table ? filterTableBySearch(table, search) : undefined),
    [table, search]
  );

  // Courseware is a student-less "pick material to assign" view, so the grid
  // deliberately shows no per-student progress: done/assigned (and CW/HW) are
  // per-student concepts that read as ambiguous here ("done by whom?"). Chips
  // stay neutral; selection/coverage state lives on each student's checktable.

  const handleAssignSessions = (
    picks: SessionPick[],
    opts: { pageRange?: string; tutorNote?: string }
  ) => {
    if (!activeItem || picks.length === 0) return;
    const { page_start, page_end } = parsePageRange(opts.pageRange);
    // One record per session, exactly like CSM's per-session saveExercises.
    // recordExercise also writes the matching ChecktableAssignment (CW -> done,
    // HW -> assigned) via the item's checktable link.
    for (const pick of picks) {
      recordExercise({
        sessionId: pick.sessionId,
        studentId: pick.studentId,
        kind: pick.kind,
        pdf_name: activeItem.code,
        item_id: activeItem.id,
        page_start,
        page_end,
        remarks: opts.tutorNote || undefined,
      });
    }
    setToast(
      `Assigned ${activeItem.code} to ${picks.length} session${
        picks.length === 1 ? "" : "s"
      }`
    );
    setActiveItem(null);
    window.setTimeout(() => setToast(null), 3500);
  };

  return (
    <div className="space-y-3">
      {/* Family tabs */}
      <div className="flex flex-wrap gap-1">
        {families.map(([name]) => {
          const active = name === family;
          return (
            <button
              key={name}
              type="button"
              onClick={() => pickFamily(name)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-ink-800 text-white"
                  : "text-ink-700 hover:bg-ink-100 border border-ink-200"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>

      {/* Level pills for the active family */}
      <div className="flex flex-wrap items-center gap-1.5">
        {levels.map((t) => {
          const active = t.id === (table?.id ?? "");
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => pickLevel(t.id)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                active
                  ? "bg-mc-red-600 text-white"
                  : "bg-white text-ink-600 border border-ink-200 hover:bg-ink-50"
              }`}
            >
              {shortLevel(t.levelLabel ?? t.textbook)}
              <span
                className={`ml-1.5 ${active ? "text-white/70" : "text-ink-400"}`}
              >
                {t.grade}
              </span>
            </button>
          );
        })}
      </div>

      {/* Success toast: announced to AT, overlaid so it doesn't shift layout,
          and manually dismissible. */}
      <div aria-live="polite" className="sr-only">
        {toast}
      </div>
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md border border-good/30 bg-good/10 px-3 py-2 text-sm text-ink-800 shadow-lg backdrop-blur-sm">
          <CheckCircle2 className="h-4 w-4 text-good shrink-0" />
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="ml-1 text-ink-400 hover:text-ink-800 p-0.5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {table ? (
        <>
          <div className="flex items-center gap-2 text-sm text-ink-700 pt-1">
            <Library className="h-4 w-4 text-ink-500" />
            <span className="font-medium">{table.family}</span>
            <span className="text-ink-400">/</span>
            <span className="font-medium">{table.levelLabel}</span>
            <span className="text-ink-500">
              {table.grade} · {worksheetCount} worksheets
            </span>
          </div>
          <p className="text-xs text-ink-500 max-w-3xl">
            Click any code to preview the PDF and assign it to an upcoming
            session.
          </p>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code or chapter"
              aria-label="Search worksheets by code or chapter"
              className="w-full rounded-md border border-ink-200 pl-9 pr-9 py-2 text-sm focus:outline-none focus:border-ink-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-800 p-0.5"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <ChecktableGrid
            table={filteredTable ?? table}
            statusByItemId={EMPTY_STATUS}
            selectedItemIds={EMPTY_SELECTION}
            statusFilter="all"
            sectionFilter="all"
            onItemClick={setActiveItem}
          />
        </>
      ) : (
        <div className="surface px-4 py-10 text-center text-sm text-ink-500">
          No worksheets available.
        </div>
      )}

      {activeItem && table && (
        <AssignDialog
          item={activeItem}
          basePath={table.basePath}
          assignTargets={targets}
          onClose={() => setActiveItem(null)}
          onAssignSessions={handleAssignSessions}
        />
      )}
    </div>
  );
}
