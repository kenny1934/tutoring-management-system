"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { getAppScroller } from "@/lib/scroll";
import { attachDashboardFlow } from "./dashboardFlow";
import { attachDashboardDepth } from "./dashboardDepth";
import { NativeWideLessonJourney } from "./NativeWideLessonJourney";
import { useNativePresentation } from "./useNativePresentation";
import { useNativeNavigationMemory } from "./NativeNavigationMemory";
import styles from "./NativePreview.module.css";

/** Applies the dashboard surface while leaving the page in its natural scroll flow. */
export function NativeDashboardPreview({ children }: { children: ReactNode }) {
  const mode = useNativePresentation();
  const memory = useNativeNavigationMemory();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const main = getAppScroller();
    if (mode !== "motion" || !root.current || !main) return;
    const stopDepth = attachDashboardDepth(root.current, main);
    const readSections = memory?.get<Set<string>>("dashboard:read-sections") ?? new Set<string>();
    memory?.set("dashboard:read-sections", readSections);
    const stopFlow = attachDashboardFlow(root.current, main, readSections);
    return () => { stopFlow(); stopDepth(); };
  }, [mode, memory]);
  return <div ref={root} className={styles.dashboard} data-native-preview={mode ?? undefined}>{children}<NativeWideLessonJourney root={root} enabled={mode === "motion"} /></div>;
}
