"use client";
import { useCallback, useEffect, useRef } from 'react';

/** Requests belong to their query/selection, so cleanup cannot abort a newer view. */
export function useAbortableRequest(key: string, active: boolean) {
  const pending = useRef(new Map<AbortController, string>());
  useEffect(() => {
    const requests = pending.current;
    return () => { for (const [controller, requestKey] of requests) if (requestKey === key) { controller.abort(); requests.delete(controller); } };
  }, [key, active]);
  return useCallback(async <T,>(run: (signal: AbortSignal) => Promise<T>) => {
    const controller = new AbortController(); pending.current.set(controller, key);
    try { return await run(controller.signal); }
    finally { pending.current.delete(controller); }
  }, [key]);
}
