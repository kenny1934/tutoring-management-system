"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChecktableItem } from "@/lib/types";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import {
  collectShownItemIds,
  type GridSectionFilter,
  type GridStatusFilter,
} from "./ChecktableGrid";
import type { useChecktableEditor } from "./useChecktableEditor";

type Editor = ReturnType<typeof useChecktableEditor>;

export type BatchToast = { message: string; onUndo?: () => void } | null;

/** The shared print-batch interaction surface for a checktable view: select
 *  mode (tap-to-queue), the "Add N shown" target, and an undoable clear/print
 *  with a transient toast. Both the student tab and the session drawer drive
 *  the exact same behaviour, so it lives here rather than being copy-pasted. */
export function usePrintBatchUI(
  editor: Editor,
  gridStatus: GridStatusFilter,
  gridSection: GridSectionFilter
) {
  const { togglePrintBatch, clearPrintBatch } = usePrimaryStore();

  // Tap a chip to queue/unqueue instead of opening the assign dialog. A ref
  // keeps the handler identity stable so the memoised chips don't all
  // re-render on a mode flip.
  const [selectMode, setSelectMode] = useState(false);
  const selectModeRef = useRef(selectMode);
  useEffect(() => {
    selectModeRef.current = selectMode;
  }, [selectMode]);

  const { printBatchKey, setActiveItem } = editor;
  const handleChipClick = useCallback(
    (item: ChecktableItem) => {
      if (selectModeRef.current) togglePrintBatch(printBatchKey, item.id);
      else setActiveItem(item);
    },
    [togglePrintBatch, printBatchKey, setActiveItem]
  );

  // Everything matching the current filters — what the grid/syllabus shows.
  const shownItemIds = useMemo(
    () =>
      editor.table
        ? collectShownItemIds(
            editor.table,
            editor.statusByItemId,
            gridSection,
            gridStatus
          )
        : [],
    [editor.table, editor.statusByItemId, gridSection, gridStatus]
  );
  const shownPending = useMemo(
    () => shownItemIds.filter((i) => !editor.selectedIds.has(i)).length,
    [shownItemIds, editor.selectedIds]
  );

  // Transient toast with an optional Undo (reverses a clear or demo-print
  // before the queue is really gone).
  const [toast, setToast] = useState<BatchToast>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);
  const showToast = useCallback((message: string, onUndo?: () => void) => {
    setToast({ message, onUndo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const onClearBatch = useCallback(() => {
    const snapshot = editor.printBatchEntriesRaw;
    clearPrintBatch(printBatchKey);
    showToast(`Cleared ${snapshot.length} from the batch`, () =>
      editor.addEntriesToBatch(snapshot)
    );
  }, [editor, clearPrintBatch, printBatchKey, showToast]);

  const onPrintBatch = useCallback(() => {
    const snapshot = editor.printBatchEntriesRaw;
    const count = snapshot.length;
    clearPrintBatch(printBatchKey);
    showToast(
      `Would print ${count} ${count === 1 ? "PDF" : "PDFs"} (demo)`,
      () => editor.addEntriesToBatch(snapshot)
    );
  }, [editor, clearPrintBatch, printBatchKey, showToast]);

  return {
    selectMode,
    setSelectMode,
    handleChipClick,
    shownItemIds,
    shownPending,
    toast,
    dismissToast,
    onClearBatch,
    onPrintBatch,
  };
}
