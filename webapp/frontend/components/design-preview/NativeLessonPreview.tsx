"use client";

import { useRef, type ReactNode } from "react";
import { NativeWideLessonJourney } from "./NativeWideLessonJourney";
import { useNativePresentation } from "./useNativePresentation";

/** Keeps the source screen mounted throughout a lesson journey. */
export function NativeLessonPreview({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const mode = useNativePresentation();
  return <div ref={root} style={{ display: "contents" }} data-native-lesson-preview>{children}<NativeWideLessonJourney root={root} enabled={mode === "motion"} /></div>;
}
