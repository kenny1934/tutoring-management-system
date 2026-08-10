"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { homeworkAPI } from "@/lib/api";

export interface HomeworkCounts {
  total: number;
  checked: number;
}

interface HomeworkCountsActions {
  /** Register interest in a session, so its counts get fetched. */
  watch: (sessionId: number) => void;
  /** Re-fetch a session's counts, after marking homework somewhere. */
  refresh: (sessionId: number) => void;
}

// Actions and data are separate contexts on purpose. The actions never change
// identity, so a badge subscribes once; if they shared a context every batch
// would re-run every badge's effect and queue the ids all over again.
const HomeworkCountsActionsContext = createContext<HomeworkCountsActions | null>(null);
const HomeworkCountsDataContext = createContext<Map<number, HomeworkCounts> | null>(null);

// The counts query costs a few milliseconds per session, so ask only for the
// rows actually on screen and send them as one batch.
const BATCH_DELAY_MS = 60;
const CHUNK_SIZE = 100;

/**
 * Collects the session ids of every mounted homework badge and fetches their
 * counts in batches. Rows behind "show more" cost nothing until rendered.
 */
export function HomeworkCountsProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState<Map<number, HomeworkCounts>>(new Map());
  const pending = useRef<Set<number>>(new Set());
  const fetched = useRef<Set<number>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    timer.current = null;
    const ids = Array.from(pending.current);
    pending.current.clear();
    if (!ids.length) return;

    ids.forEach((id) => fetched.current.add(id));

    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      chunks.push(ids.slice(i, i + CHUNK_SIZE));
    }

    const results = await Promise.all(
      chunks.map((chunk) =>
        homeworkAPI.getCounts(chunk).catch(() => {
          // A failed chunk should be retryable rather than cached as empty.
          chunk.forEach((id) => fetched.current.delete(id));
          return [];
        })
      )
    );

    setCounts((current) => {
      const next = new Map(current);
      // Sessions with no open homework come back absent, so seed zeroes first.
      ids.forEach((id) => {
        if (!next.has(id)) next.set(id, { total: 0, checked: 0 });
      });
      results.flat().forEach((row) => {
        next.set(row.session_id, { total: row.total, checked: row.checked });
      });
      return next;
    });
  }, []);

  const schedule = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => void flush(), BATCH_DELAY_MS);
  }, [flush]);

  const actions = useMemo<HomeworkCountsActions>(
    () => ({
      watch: (sessionId: number) => {
        if (fetched.current.has(sessionId)) return;
        pending.current.add(sessionId);
        schedule();
      },
      refresh: (sessionId: number) => {
        fetched.current.delete(sessionId);
        pending.current.add(sessionId);
        schedule();
      },
    }),
    [schedule]
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <HomeworkCountsActionsContext.Provider value={actions}>
      <HomeworkCountsDataContext.Provider value={counts}>
        {children}
      </HomeworkCountsDataContext.Provider>
    </HomeworkCountsActionsContext.Provider>
  );
}

/**
 * Open homework counts for one session. Returns null outside a provider, or
 * until the batch resolves, so callers can render nothing.
 */
export function useHomeworkCounts(sessionId: number | null | undefined): HomeworkCounts | null {
  const actions = useContext(HomeworkCountsActionsContext);
  const counts = useContext(HomeworkCountsDataContext);

  useEffect(() => {
    if (actions && sessionId) actions.watch(sessionId);
  }, [actions, sessionId]);

  if (!sessionId) return null;
  return counts?.get(sessionId) ?? null;
}

/** Ask the provider to re-count a session after homework was marked. */
export function useRefreshHomeworkCounts() {
  const actions = useContext(HomeworkCountsActionsContext);
  return useCallback(
    (sessionId: number) => actions?.refresh(sessionId),
    [actions]
  );
}
