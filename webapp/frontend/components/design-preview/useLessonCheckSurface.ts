"use client";

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { isTypingTarget } from "@/lib/lesson-utils";
import { useBackToClose } from "@/hooks/useBackToClose";
import { LESSON_DISMISS_OVERLAY_EVENT, lessonFrameToken } from "./lessonFrame";

/** The homework overlay belongs to the lesson's visible area, including inside its cropped frame. */
export function useLessonCheckSurface(
  enabled: boolean,
  phone: boolean,
  topmost: boolean,
  panel: RefObject<HTMLDivElement | null>,
  onClose: () => void,
) {
  const backdrop = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<CSSProperties>({});
  const closing = useRef(false);
  const live = useRef(true);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const animations = useRef<Animation[]>([]);
  const receding = useRef<HTMLElement | null>(null);
  const close = useCallback(() => {
    if (closing.current) return;
    const active = document.activeElement;
    if (enabled && active instanceof HTMLElement && panel.current?.contains(active) && isTypingTarget(active)) {
      active.blur(); return;
    }
    if (!enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !panel.current?.animate) {
      closeRef.current(); return;
    }
    closing.current = true;
    const animation = panel.current.animate(
      [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: `translateY(${phone ? 64 : 6}px)` }],
      { duration: phone ? 180 : 120, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" },
    );
    animations.current.push(animation);
    const underlay = receding.current;
    if (phone && underlay?.animate) animations.current.push(underlay.animate(
      [{ transform: getComputedStyle(underlay).transform }, { transform: "none" }],
      { duration: 180, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" },
    ));
    void animation.finished.then(() => { if (live.current) closeRef.current(); }).catch(() => {});
  }, [enabled, phone, panel]);

  useBackToClose(enabled && phone && !lessonFrameToken(), () => { if (topmost) close(); });

  useLayoutEffect(() => {
    if (!enabled) return;
    const phone = window.matchMedia("(max-width: 767px)").matches;
    live.current = true;
    closing.current = false;
    const surface = panel.current;
    const stage = document.querySelector<HTMLElement>("[data-native-wide-lesson]");
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const materials = opener?.closest<HTMLElement>('[role="dialog"]');
    const outside = [...document.body.children].filter((el): el is HTMLElement =>
      el instanceof HTMLElement && !["SCRIPT", "STYLE"].includes(el.tagName) && !el.contains(backdrop.current),
    );
    const underlays = [...new Set([stage, materials, ...outside].filter((el): el is HTMLElement => !!el && !el.contains(surface)))];
    const inert = underlays.map(el => ({ el, previous: el.inert }));
    inert.forEach(({ el }) => { el.inert = true; });
    const measure = () => {
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      setBounds({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    };
    measure();
    const observer = stage ? new ResizeObserver(measure) : null;
    if (stage) observer?.observe(stage);
    window.addEventListener("resize", measure);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced && panel.current?.animate) {
      animations.current.push(panel.current.animate(
        [{ opacity: 0, transform: `translateY(${phone ? 64 : 8}px)` }, { opacity: 1, transform: "translateY(0)" }],
        { duration: phone ? 300 : 160, easing: "cubic-bezier(.2,.7,.2,1)" },
      ));
      // A phone's materials stay in place behind the new surface. Desktop context remains steady.
      if (phone && materials?.animate) {
        receding.current = materials;
        animations.current.push(materials.animate(
          [{ transform: "scale(1)" }, { transform: "translateY(-8px) scale(.98)" }],
          { duration: 300, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" },
        ));
      }
    }
    panel.current?.focus({ preventScroll: true });
    return () => {
      live.current = false;
      closing.current = false;
      receding.current = null;
      animations.current.forEach(animation => animation.cancel());
      animations.current = [];
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      inert.forEach(({ el, previous }) => { el.inert = previous; });
      queueMicrotask(() => {
        const active = document.activeElement;
        if (opener?.isConnected && (active === document.body || !active || surface?.contains(active))) opener.focus({ preventScroll: true });
      });
    };
  }, [enabled, panel]);

  useLayoutEffect(() => {
    if (!enabled) return;
    const dismiss = (event: Event) => {
      if (!topmost || event.defaultPrevented) return;
      event.preventDefault(); close();
    };
    window.addEventListener(LESSON_DISMISS_OVERLAY_EVENT, dismiss);
    return () => window.removeEventListener(LESSON_DISMISS_OVERLAY_EVENT, dismiss);
  }, [enabled, topmost, close]);

  return { backdrop, bounds: enabled ? bounds : undefined, close };
}
