"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { animateLessonArrival, animateLessonFocus } from "./lessonJourney";
import { lessonFrameToken } from "./lessonFrame";

export function useWideLessonMotion(stage: RefObject<HTMLDivElement | null>, enabled: boolean, focusMode: boolean) {
  const previous = useRef<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!enabled || !stage.current || lessonFrameToken()) return;
    return animateLessonArrival(stage.current);
  }, [stage, enabled]);
  useLayoutEffect(() => {
    const viewer = stage.current?.querySelector<HTMLElement>("[data-native-lesson-viewer]");
    if (!enabled || !viewer) { previous.current = null; return; }
    const before = previous.current;
    // Store its final layout position before the animation adds a temporary translation.
    previous.current = viewer.getBoundingClientRect();
    const cancel = before ? animateLessonFocus(viewer, before) : () => {};
    const settlingUntil = performance.now() + 240;
    const remember = () => {
      if (performance.now() >= settlingUntil) previous.current = viewer.getBoundingClientRect();
    };
    const settled = window.setTimeout(remember, 250);
    const observer = new ResizeObserver(remember);
    observer.observe(viewer);
    return () => { cancel(); observer.disconnect(); clearTimeout(settled); };
  }, [stage, enabled, focusMode]);
}
