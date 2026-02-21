import { useEffect, useState, useCallback } from "react";
import type { Editor } from "@tiptap/core";
import { paginationPluginKey } from "@/lib/tiptap-extensions/pagination";
import type { PageBreakInfo, PageChromePosition } from "@/lib/tiptap-extensions/pagination-utils";

export type { PageChromePosition };

export interface PaginationState {
  breaks: PageBreakInfo[];
  totalPages: number;
  lastPageRemainingPx: number;
  chromePositions: PageChromePosition[];
}

const EMPTY_STATE: PaginationState = {
  breaks: [],
  totalPages: 1,
  lastPageRemainingPx: 0,
  chromePositions: [],
};

/**
 * Hook to consume pagination plugin state from a TipTap editor.
 * Listens to all transactions (not just doc changes) since pagination
 * dispatches meta-only transactions with updated break positions.
 */
export function usePaginationState(editor: Editor | null): PaginationState {
  const [state, setState] = useState<PaginationState>(EMPTY_STATE);

  const update = useCallback(() => {
    if (!editor) return;
    const pluginState = paginationPluginKey.getState(editor.state);
    if (!pluginState) return;

    const breaks: PageBreakInfo[] = pluginState.breaks ?? [];
    const totalPages = breaks.length + 1;
    const lastPageRemainingPx = pluginState.lastPageRemainingPx ?? 0;
    const chromePositions: PageChromePosition[] = pluginState.chromePositions ?? [];

    setState({ breaks, totalPages, lastPageRemainingPx, chromePositions });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    update();
    editor.on("transaction", update);
    return () => { editor.off("transaction", update); };
  }, [editor, update]);

  return state;
}
