"use client";

import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { attachWorksheetHandoff } from "./worksheetHandoff";
import styles from "./NativePreview.module.css";

export function useWorksheetHandoff(root: RefObject<HTMLElement | null>, enabled: boolean) {
  const controller = useRef<ReturnType<typeof attachWorksheetHandoff> | null>(null);
  useLayoutEffect(() => {
    if (!enabled || !root.current) return;
    const current = attachWorksheetHandoff(root.current, { hold: styles.worksheetHold, status: styles.worksheetHoldStatus });
    controller.current = current;
    return () => { current.dispose(); if (controller.current === current) controller.current = null; };
  }, [root, enabled]);
  const prepare = useCallback((next: number | null) => controller.current?.prepare(next), []);
  const isPending = useCallback(() => controller.current?.isPending() ?? false, []);
  return { prepare, isPending };
}
