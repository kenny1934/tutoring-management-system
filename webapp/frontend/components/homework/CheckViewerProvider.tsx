"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePdfCache } from "@/hooks/useExercisePdf";
import type { AnswerSearchResult } from "@/lib/answer-file-utils";
import type { CheckItem } from "@/lib/homework-check";
import type { HomeworkCompletion } from "@/types";

// The viewer brings the whole PDF renderer with it, so it's only fetched the
// first time someone opens it.
const CheckViewer = dynamic(() => import("./CheckViewer").then((mod) => mod.CheckViewer), { ssr: false });

interface CheckViewerApi {
  /** Opens the Check Viewer on this item. */
  open: (item: CheckItem) => void;
}

const CheckViewerContext = createContext<CheckViewerApi | null>(null);

/**
 * The nearest Check Viewer, or null when nothing above this row offers one.
 * HomeworkCheckRow only shows its open button when there is one.
 */
export function useCheckViewer(): CheckViewerApi | null {
  return useContext(CheckViewerContext);
}

/**
 * Lets every homework row inside it open the Check Viewer, which shows a
 * homework item's worksheet and its answer key side by side, and steps
 * through `items` with next and previous.
 *
 * The widest list wins. When a provider already sits above this one, this one
 * steps aside and the outer one's list is used. That's how bulk rate and wide
 * lesson mode step across every student in the slot, even though each
 * student's panel brings a provider of its own.
 *
 * The files the viewer loads and the answer keys it searches for are kept
 * here, for as long as the surface is open. So going back to an item, or
 * opening the viewer again, doesn't fetch anything twice.
 */
export function CheckViewerProvider({
  items,
  readOnly,
  onMarked,
  children,
}: {
  items: CheckItem[];
  readOnly?: boolean;
  /** Called with each record saved from inside the viewer, like a row's own onMarked. */
  onMarked?: (updated: HomeworkCompletion) => void;
  children: ReactNode;
}) {
  const outer = useCheckViewer();
  const [current, setCurrent] = useState<CheckItem | null>(null);
  const cache = usePdfCache();
  const [searches] = useState(() => new Map<string, AnswerSearchResult | null>());
  const close = useCallback(() => setCurrent(null), []);
  const api = useMemo<CheckViewerApi>(() => ({ open: setCurrent }), []);

  if (outer) return <>{children}</>;

  return (
    <CheckViewerContext.Provider value={api}>
      {children}
      {current && (
        <CheckViewer
          items={items}
          current={current}
          onNavigate={setCurrent}
          onClose={close}
          readOnly={readOnly}
          onMarked={onMarked}
          cache={cache}
          searches={searches}
        />
      )}
    </CheckViewerContext.Provider>
  );
}
