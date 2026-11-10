"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getAppScroller } from "@/lib/scroll";
import { animateSessionIdentity, recessSessionBackground, sessionMotionReduced } from "./sessionDetailMotion";
import styles from "./NativePreview.module.css";

type Options = {
  enabled: boolean;
  source?: HTMLElement | null;
  asSheet: boolean;
  positioned: boolean;
  canFocus?: boolean;
  zIndex: number;
  onClose: () => void;
};

/** Gives session details continuity while the real popover, sheet and controls stay mounted. */
export function useNativeSessionDetail({ enabled, source, asSheet, positioned, canFocus = true, zIndex, onClose }: Options) {
  const [surface, setSurface] = useState<HTMLElement | null>(null);
  const identity = useRef<HTMLDivElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(source ?? null);
  const closeCallback = useRef(onClose);
  const closing = useRef(false);
  const identityAnimation = useRef<(() => void) | null>(null);
  const exitAnimation = useRef<Animation | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { closeCallback.current = onClose; }, [onClose]);
  useEffect(() => { returnFocus.current = source ?? null; }, [source]);

  useLayoutEffect(() => {
    if (!enabled || !source || !surface) return;
    const main = getAppScroller();
    if (!main) return;
    const restore = recessSessionBackground(main, asSheet, styles.sessionBackground);
    closing.current = false;
    return () => {
      closing.current = true;
      exitAnimation.current?.cancel();
      if (exitTimer.current !== null) clearTimeout(exitTimer.current);
      restore();
      // The floating focus manager may choose a checkbox inside a row. Wait
      // until its cleanup and the background restoration finish, then focus
      // the row itself unless the reader has moved to another control.
      requestAnimationFrame(() => {
        if (!source.isConnected || source.closest("[inert]")) return;
        const active = document.activeElement;
        if (active && active !== document.body && active.isConnected && !source.contains(active)) return;
        source.focus({ preventScroll: true });
      });
    };
  }, [enabled, source, surface, asSheet]);

  useEffect(() => {
    if (!enabled || !source || !surface || !canFocus) return;
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && surface.contains(active)) return;
      // A newly opened editor owns its focus even before the overlay stack settles.
      if (active && active !== document.body && !source.contains(active)) return;
      surface.querySelector<HTMLElement>('button[aria-label="Close"]')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [enabled, source, surface, canFocus]);

  useEffect(() => {
    if (!enabled || !source || !surface || !positioned) return;
    const target = identity.current;
    const origin = source.querySelector<HTMLElement>("[data-native-session-identity]");
    if (!target || !origin) return;
    const cancel = animateSessionIdentity(origin, target, surface, asSheet, zIndex);
    identityAnimation.current = cancel;
    return () => { cancel(); identityAnimation.current = null; };
  }, [enabled, source, surface, asSheet, positioned, zIndex]);

  const beginClose = useCallback(() => {
    if (!enabled) return;
    identityAnimation.current?.();
    const main = getAppScroller();
    if (main) delete main.dataset.nativeSessionOpen;
  }, [enabled]);

  const close = useCallback(() => {
    beginClose();
    if (!enabled || asSheet || sessionMotionReduced() || !surface) { closeCallback.current(); return; }
    if (closing.current) return;
    closing.current = true;
    if (typeof surface.animate === "function") {
      exitAnimation.current = surface.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: "forwards" });
    }
    exitTimer.current = setTimeout(() => closeCallback.current(), 140);
  }, [enabled, asSheet, surface, beginClose]);

  return { enabled, setSurface, identity, returnFocus, close, beginClose };
}
