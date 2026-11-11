"use client";

import { useEffect, type RefObject } from "react";

/** Both lesson views give phone sheets the same height and background ownership. */
export function useLessonPhoneSurface(stage: RefObject<HTMLElement | null>, enabled: boolean, sheetOpen: boolean) {
  useEffect(() => {
    const element = stage.current;
    if (!enabled || !element) return;
    const body = document.body, property = "--native-lesson-height";
    const previous = body.style.getPropertyValue(property);
    const measure = () => body.style.setProperty(property, `${element.clientHeight}px`);
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => { observer.disconnect(); if (previous) body.style.setProperty(property, previous); else body.style.removeProperty(property); };
  }, [stage, enabled]);
  useEffect(() => {
    const element = stage.current;
    if (!enabled || !sheetOpen || !element) return;
    const previous = element.inert; element.inert = true;
    return () => { element.inert = previous; };
  }, [stage, enabled, sheetOpen]);
}
