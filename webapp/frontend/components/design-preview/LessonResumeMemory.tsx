"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, type ReactNode } from "react";
import { activateLessonResumeScope, LessonResumeEntry, LessonResumeMemory, type LessonTarget } from "./lessonResume";

const Context = createContext<{ memory: LessonResumeMemory | null; ready: boolean }>({ memory: null, ready: true });
export const useLessonResumeScope = () => useContext(Context);

/** Same-origin lesson frames share this tab's bucket, but never another viewer's scope. */
export function LessonResumeProvider({ scope, ready, children }: { scope: string | null; ready: boolean; children: ReactNode }) {
  const memory = useMemo(() => scope ? new LessonResumeMemory(scope) : null, [scope]);
  useLayoutEffect(() => { if (ready) activateLessonResumeScope(scope); }, [ready, scope]);
  const value = useMemo(() => ({ memory, ready }), [memory, ready]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLessonResumeEntry(key: string, targets: LessonTarget[], enabled: boolean) {
  const { memory, ready } = useLessonResumeScope();
  const active = enabled ? memory : null;
  const entry = useMemo(() => new LessonResumeEntry(active, key), [active, key]);
  const reconciled = useMemo(() => { entry.reconcile(targets); return entry; }, [entry, targets]);
  useEffect(() => {
    window.addEventListener("pagehide", entry.flush);
    return () => { window.removeEventListener("pagehide", entry.flush); entry.flush(); };
  }, [entry]);
  return { entry: reconciled, ready: !enabled || ready };
}
