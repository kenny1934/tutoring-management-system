"use client";
import { useCallback, useEffect, useRef } from 'react';

class CancelledSearchRequest extends Error {
  constructor() { super('Search request was cancelled.'); this.name = 'CancelledSearchRequest'; }
}

export function isCancelledSearchRequest(error: unknown) {
  return error instanceof Error && error.name === 'CancelledSearchRequest';
}

/** Each query activation owns its requests, including same-query resumes. */
export function useAbortableRequest(key: string, active: boolean) {
  const pending = useRef(new Map<AbortController, object>());
  const current = useRef({ key, active });
  if (current.current.key !== key || current.current.active !== active) current.current = { key, active };
  const owner = current.current;
  useEffect(() => {
    const requests = pending.current;
    return () => { for (const [controller, requestOwner] of requests) if (requestOwner === owner) { controller.abort(); requests.delete(controller); } };
  }, [owner]);
  return useCallback(async <T,>(run: (signal: AbortSignal) => Promise<T>) => {
    // SWR can retain a fetcher after its view has changed. A replacement can
    // also start in a layout effect before the previous passive cleanup runs.
    if (!owner.active || current.current !== owner) throw new CancelledSearchRequest();
    const controller = new AbortController(); pending.current.set(controller, owner);
    try {
      const result = await run(controller.signal);
      if (controller.signal.aborted) throw new CancelledSearchRequest();
      return result;
    } catch (error) {
      if (controller.signal.aborted) throw new CancelledSearchRequest();
      throw error;
    } finally { pending.current.delete(controller); }
  }, [owner]);
}
