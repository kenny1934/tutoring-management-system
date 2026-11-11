"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/** Keep one real month grid and move only its selection and newly chosen content. */
export function useCalendarMotion(root: RefObject<HTMLElement | null>, enabled: boolean, month: number, selected: string | null) {
  const previous = useRef<{ month: number; selected: string | null; x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const panel = root.current;
    if (!enabled || !panel) { previous.current = null; return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations: Animation[] = [];
    const before = previous.current;
    const indicator = panel.querySelector<HTMLElement>("[data-calendar-selection]");
    const measure = (animate = false) => {
      const day = panel.querySelector<HTMLElement>('[data-calendar-day][aria-selected="true"]');
      if (!indicator) return;
      indicator.hidden = !day;
      if (!day) { previous.current = { month, selected, x: 0, y: 0 }; return; }
      const x = day.offsetLeft, y = day.offsetTop;
      Object.assign(indicator.style, { width: `${day.offsetWidth}px`, height: `${day.offsetHeight}px`, transform: `translate(${x}px, ${y}px)` });
      if (animate && before?.selected && before.month === month && before.selected !== selected && !reduced.matches && indicator.animate) {
        animations.push(indicator.animate([{ transform: `translate(${before.x}px, ${before.y}px)` }, { transform: `translate(${x}px, ${y}px)` }], { duration: 180, easing: "cubic-bezier(.2,.7,.2,1)" }));
      }
      previous.current = { month, selected, x, y };
    };
    measure(true);
    const agenda = panel.querySelector<HTMLElement>("[data-calendar-agenda]");
    if (before && before.selected !== selected && agenda) agenda.scrollTop = 0;
    if (before && !reduced.matches) {
      const page = panel.querySelector<HTMLElement>("[data-calendar-month-page]");
      if (before.month !== month && page?.animate) {
        const direction = month > before.month ? 1 : -1;
        animations.push(page.animate([{ opacity: .6, translate: `${direction * 12}px 0` }, { opacity: 1, translate: "0 0" }], { duration: 180, easing: "ease-out" }));
      }
      if (before.selected !== selected && agenda?.animate) {
        animations.push(agenda.animate([{ opacity: .65 }, { opacity: 1 }], { duration: 140, easing: "ease-out" }));
      }
    }
    const cancel = () => animations.forEach(animation => animation.cancel());
    const grid = panel.querySelector<HTMLElement>("[data-calendar-days]") ?? panel;
    let width = grid.offsetWidth, height = grid.offsetHeight;
    const resized = () => {
      if (width === grid.offsetWidth && height === grid.offsetHeight) return;
      width = grid.offsetWidth; height = grid.offsetHeight;
      cancel(); measure();
    };
    const observer = new ResizeObserver(resized); observer.observe(grid);
    const motionChanged = () => { if (reduced.matches) cancel(); };
    reduced.addEventListener("change", motionChanged);
    return () => { cancel(); observer.disconnect(); reduced.removeEventListener("change", motionChanged); };
  }, [root, enabled, month, selected]);
}
