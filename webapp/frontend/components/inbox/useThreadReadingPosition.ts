"use client";

import { useEffect, useLayoutEffect, type RefObject } from "react";

type Place = { top: number; bottom: boolean; anchor?: string; offset?: number };
// Reading coordinates only, scoped to the viewing tutor and bounded for this browser tab.
const places = new Map<string, Place>();
const remember = (key: string, place: Place) => {
  places.delete(key); places.set(key, place);
  if (places.size > 80) places.delete(places.keys().next().value!);
};

export function useThreadReadingPosition({ scroller, content, scope, ready, animate, targetId }: {
  scroller: RefObject<HTMLDivElement | null>;
  content: RefObject<HTMLDivElement | null>;
  scope: string;
  ready: boolean;
  animate: boolean;
  targetId?: number | null;
}) {
  useLayoutEffect(() => {
    const pane = scroller.current, body = content.current;
    if (!ready || !pane || !body) return;
    const place = places.get(scope);
    let restoring = true;
    const snapshot = (): Place => {
      const top = pane.getBoundingClientRect().top;
      const anchor = [...body.querySelectorAll<HTMLElement>('[id^="msg-"]')].find(row => row.getBoundingClientRect().bottom > top + 1);
      return { top: pane.scrollTop, bottom: pane.scrollHeight - pane.clientHeight - pane.scrollTop < 24,
        anchor: anchor?.id, offset: anchor ? anchor.getBoundingClientRect().top - top : undefined };
    };
    const restore = () => {
      if (!restoring) return;
      const target = targetId ? body.querySelector<HTMLElement>(`#msg-${targetId}`) : null;
      if (target) pane.scrollTop += target.getBoundingClientRect().top - pane.getBoundingClientRect().top - Math.max(16, (pane.clientHeight - target.offsetHeight) / 2);
      else if (!place || place.bottom) pane.scrollTop = pane.scrollHeight;
      else {
        const anchor = [...body.querySelectorAll<HTMLElement>('[id^="msg-"]')].find(row => row.id === place.anchor);
        pane.scrollTop = anchor && place.offset !== undefined
          ? pane.scrollTop + anchor.getBoundingClientRect().top - pane.getBoundingClientRect().top - place.offset
          : place.top;
      }
    };
    const save = () => { if (!restoring) remember(scope, snapshot()); };
    const takeOver = () => { restoring = false; observer.disconnect(); remember(scope, snapshot()); };
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Tab"].includes(event.key)) takeOver();
    };
    const observer = new ResizeObserver(restore);
    observer.observe(body);
    restore();
    const frame = requestAnimationFrame(restore);
    pane.addEventListener("scroll", save, { passive: true });
    pane.addEventListener("wheel", takeOver, { passive: true });
    pane.addEventListener("touchstart", takeOver, { passive: true });
    pane.addEventListener("pointerdown", takeOver);
    pane.addEventListener("keydown", onKey);
    return () => {
      remember(scope, snapshot());
      observer.disconnect(); cancelAnimationFrame(frame);
      pane.removeEventListener("scroll", save); pane.removeEventListener("wheel", takeOver);
      pane.removeEventListener("touchstart", takeOver); pane.removeEventListener("pointerdown", takeOver);
      pane.removeEventListener("keydown", onKey);
    };
  }, [scope, ready, scroller, content, targetId]);

  useEffect(() => {
    if (!ready || !targetId) return;
    const target = content.current?.querySelector<HTMLElement>(`#msg-${targetId}`);
    if (!target) return;
    const previous = target.style.outline;
    target.style.outline = "2px solid var(--color-accent, #a66b3d)";
    const animation = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? undefined
      : target.animate?.([{ outlineColor: "#a66b3d" }, { outlineColor: "transparent" }], { duration: 1600 });
    const timer = setTimeout(() => { target.style.outline = previous; }, 1600);
    return () => { clearTimeout(timer); animation?.cancel(); target.style.outline = previous; };
  }, [scope, ready, targetId, content]);

  useEffect(() => {
    if (!animate || !ready || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const body = content.current;
    const animation = body?.animate?.([{ opacity: .72 }, { opacity: 1 }], { duration: 120, easing: "ease-out" });
    return () => animation?.cancel();
  }, [scope, ready, animate, content]);
}
