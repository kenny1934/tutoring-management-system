"use client";

import { useCallback } from "react";
import { mutate as globalMutate } from "swr";
import { useRefreshHomeworkCounts } from "./HomeworkCountsProvider";
import type { HomeworkCompletion, Session, SessionHomework } from "@/types";

/**
 * What every marking surface does after a save: fold the record into each
 * cache holding it, then re-count the session's badge.
 *
 * The same homework arrives through two endpoints, the session detail and the
 * bulk lookup, so a mark made in one surface has to reach the other. Doing it
 * here means a new surface only has to call this.
 */
export function useHomeworkMarked() {
  const refreshCounts = useRefreshHomeworkCounts();

  return useCallback(
    (updated: HomeworkCompletion) => {
      const replace = (hw: HomeworkCompletion) =>
        hw.session_exercise_id === updated.session_exercise_id ? updated : hw;

      // Session detail, as loaded by useSession.
      void globalMutate(
        (key) =>
          Array.isArray(key) && key[0] === "session" && key[1] === updated.current_session_id,
        (current?: Session) =>
          current?.homework_completion
            ? { ...current, homework_completion: current.homework_completion.map(replace) }
            : current,
        { revalidate: false }
      );

      // Any bulk lookup that covers this session, as loaded by useHomeworkToCheck.
      void globalMutate(
        (key) => Array.isArray(key) && key[0] === "homework-to-check",
        (current?: SessionHomework[]) =>
          current?.map((entry) =>
            entry.session_id === updated.current_session_id
              ? { ...entry, homework: entry.homework.map(replace) }
              : entry
          ),
        { revalidate: false }
      );

      refreshCounts(updated.current_session_id);
    },
    [refreshCounts]
  );
}
