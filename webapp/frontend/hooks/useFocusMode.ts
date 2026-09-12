"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

// The mouse arms the header at the very top of the screen, and the header
// still comes while the mouse stays within the top 48px. The sidebar opens
// from anywhere within 48px of the left edge, where there's no toolbar to get
// in the way.
const HEADER_ARM_PX = 5;
const HEADER_ZONE_PX = 48;
const SIDEBAR_ZONE_PX = 48;
const HEADER_DELAY_MS = 200;
const SIDEBAR_DELAY_MS = 100;

type Timer = ReturnType<typeof setTimeout> | undefined;

function clearTimer(timer: RefObject<Timer>) {
  clearTimeout(timer.current);
  timer.current = undefined;
}

/**
 * Focus mode for both lesson views. It hides the header and the sidebar so
 * the worksheet has the whole screen, and brings each one back while the
 * mouse rests at its edge of the screen. FocusOverlays draws them.
 *
 * It only works while `enabled` is true, which the views set to "not on a
 * phone". A phone has no mouse to bring the header back, and no button on
 * screen that leaves focus mode, so there it always reads as off and F does
 * nothing.
 */
export function useFocusMode(enabled: boolean) {
  const [on, setOn] = useState(false);
  const [hoverHeader, setHoverHeader] = useState(false);
  const [hoverSidebar, setHoverSidebar] = useState(false);
  const headerTimerRef = useRef<Timer>(undefined);
  const sidebarTimerRef = useRef<Timer>(undefined);
  const focusMode = on && enabled;

  const exitFocusMode = useCallback(() => {
    clearTimer(headerTimerRef);
    clearTimer(sidebarTimerRef);
    setOn(false);
    setHoverHeader(false);
    setHoverSidebar(false);
  }, []);

  const toggleFocusMode = useCallback(() => {
    if (!enabled) return;
    setOn((was) => !was);
    setHoverHeader(false);
    setHoverSidebar(false);
  }, [enabled]);

  // The mouse is only watched while focus mode is on. Once an overlay is
  // showing, its own mouseleave closes it, so the watch here skips it.
  useEffect(() => {
    if (!focusMode) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!hoverHeader) {
        if (e.clientY <= HEADER_ARM_PX && !headerTimerRef.current) {
          headerTimerRef.current = setTimeout(() => setHoverHeader(true), HEADER_DELAY_MS);
        } else if (e.clientY > HEADER_ZONE_PX) {
          clearTimer(headerTimerRef);
        }
      }
      if (!hoverSidebar) {
        if (e.clientX <= SIDEBAR_ZONE_PX) {
          if (!sidebarTimerRef.current) {
            sidebarTimerRef.current = setTimeout(() => setHoverSidebar(true), SIDEBAR_DELAY_MS);
          }
        } else {
          clearTimer(sidebarTimerRef);
        }
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      clearTimer(headerTimerRef);
      clearTimer(sidebarTimerRef);
    };
  }, [focusMode, hoverHeader, hoverSidebar]);

  return { focusMode, hoverHeader, setHoverHeader, hoverSidebar, setHoverSidebar, exitFocusMode, toggleFocusMode };
}

export type FocusModeState = ReturnType<typeof useFocusMode>;
