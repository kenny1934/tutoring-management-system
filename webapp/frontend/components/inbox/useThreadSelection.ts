"use client";

import { useCallback, useLayoutEffect, useRef, useState, type SetStateAction } from "react";
import type { MessageThread } from "@/types";

/** A closed, replaced or differently scoped selection cannot be reopened by an old response. */
export function useThreadSelection(scope: string) {
  const [selectedThread, setState] = useState<MessageThread | null>(null);
  const selectionRef = useRef<MessageThread | null>(null);
  const revision = useRef(0);
  const setSelectedThread = useCallback((next: SetStateAction<MessageThread | null>) => {
    const previous = selectionRef.current;
    const value = typeof next === "function" ? next(previous) : next;
    if (!value || value.root_message.id !== previous?.root_message.id) revision.current++;
    selectionRef.current = value;
    setState(value);
  }, []);
  const invalidate = useCallback(() => { revision.current++; }, []);
  useLayoutEffect(() => {
    invalidate();
    selectionRef.current = null;
    setState(null);
    return invalidate;
  }, [scope, invalidate]);
  const openThread = useCallback(async (thread: MessageThread, load?: () => Promise<MessageThread>) => {
    const request = ++revision.current;
    selectionRef.current = thread;
    setState(thread);
    if (!load) return;
    try {
      const fullThread = await load();
      if (revision.current !== request || selectionRef.current?.root_message.id !== thread.root_message.id) return;
      selectionRef.current = fullThread;
      setState(fullThread);
    } catch (error) {
      if (revision.current === request) throw error;
    }
  }, []);
  const loadThread = useCallback(async (load: () => Promise<MessageThread>, signal?: AbortSignal) => {
    const request = ++revision.current;
    try {
      const thread = await load();
      if (signal?.aborted || revision.current !== request) return;
      selectionRef.current = thread; setState(thread);
    } catch (error) {
      if (!signal?.aborted && revision.current === request) throw error;
    }
  }, []);
  return { selectedThread, setSelectedThread, selectionRef, openThread, loadThread, invalidate };
}
