"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Checktable } from "@/lib/types";

/** Per-chapter collapse state for the syllabus view, plus collapse-all /
 *  expand-all over every chapter in the book. Resets when the book changes so
 *  a collapse carried over from another book can't hide a fresh table. */
export function useChapterCollapse(table: Checktable | undefined) {
  const allIds = useMemo(
    () =>
      table
        ? table.sections.flatMap((s) => s.chapters.map((c) => c.id))
        : [],
    [table]
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCollapsed(new Set());
  }, [table?.id]);

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const collapseAll = useCallback(
    () => setCollapsed(new Set(allIds)),
    [allIds]
  );
  const expandAll = useCallback(() => setCollapsed(new Set()), []);

  const allCollapsed = allIds.length > 0 && collapsed.size === allIds.length;

  return { collapsed, toggle, collapseAll, expandAll, allCollapsed };
}

export type ChapterCollapse = ReturnType<typeof useChapterCollapse>;
