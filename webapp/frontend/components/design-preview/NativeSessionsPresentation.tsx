"use client";

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { List, Grid3x3, Calendar, CalendarDays, ChevronDown } from "lucide-react";
import { useDaySwipe } from "@/hooks/useDaySwipe";
import { ViewSwitcher, type ViewMode } from "@/components/sessions/ViewSwitcher";
import { useHaptic } from "@/lib/useHaptic";
import { useNativePresentation } from "./useNativePresentation";
import styles from "./NativePreview.module.css";

/** Drag feedback stays here, rather than re-rendering every student on touchmove. */
export function SessionsDaySwipe({ containerRef, enabled, onPrevious, onNext }: {
  containerRef: RefObject<HTMLElement | null>; enabled: boolean; onPrevious: () => void; onNext: () => void;
}) { return useDaySwipe(containerRef, { enabled, onPrevious, onNext }); }

const views = [
  { value: "list", label: "List", Icon: List }, { value: "weekly", label: "Week", Icon: Grid3x3 },
  { value: "daily", label: "Day", Icon: Calendar }, { value: "monthly", label: "Month", Icon: CalendarDays },
] as const;

/** A native phone picker leaves room for the filters without removing any view. */
export function NativeSessionsViewSwitcher({ currentView, onViewChange }: {
  currentView: ViewMode; onViewChange: (view: ViewMode) => void;
}) {
  const mode = useNativePresentation();
  const { trigger } = useHaptic();
  const Icon = views.find(view => view.value === currentView)?.Icon ?? List;
  return <div data-native-session-view>
    <div data-native-session-view-full><ViewSwitcher currentView={currentView} onViewChange={onViewChange} compact /></div>
    {mode === "motion" && <label className={styles.sessionViewPicker} data-native-session-view-picker>
      <Icon aria-hidden="true" size={16} /><ChevronDown aria-hidden="true" size={12} />
      <select aria-label="Sessions view" value={currentView} onChange={event => {
        trigger("selection"); onViewChange(event.target.value as ViewMode);
      }}>{views.map(view => <option key={view.value} value={view.value}>{view.label}</option>)}</select>
    </label>}
  </div>;
}

/** Animate available results together. The toolbar and keyboard focus stay put. */
export function NativeSessionResults({ date, filterKey, ready, children }: {
  date: string; filterKey: string; ready: boolean; children: ReactNode;
}) {
  const mode = useNativePresentation();
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef<{ date: string; filterKey: string } | null>(null);
  useLayoutEffect(() => {
    if (!ready) return;
    const last = previous.current;
    previous.current = { date, filterKey };
    const el = root.current;
    if (!last || !el || mode !== "motion" || (last.date === date && last.filterKey === filterKey) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches || el.contains(document.activeElement) || el.closest("[inert]")) return;
    const x = last.date === date ? 0 : date > last.date ? 12 : -12;
    const animation = el.animate?.([
      { opacity: .94, transform: `translateX(${x}px)` }, { opacity: 1, transform: "translateX(0)" },
    ], { duration: 180, easing: "cubic-bezier(.2,.7,.2,1)" });
    return () => animation?.cancel();
  }, [date, filterKey, ready, mode]);
  return <div ref={root} data-native-session-results data-native-session-results-motion={mode === "motion" || undefined} className={styles.sessionResults}>{children}</div>;
}

export function NativeSessionsPresentation({ children }: { children: ReactNode }) {
  const mode = useNativePresentation();
  return <div className={styles.sessions} data-native-sessions={mode ?? undefined}>{children}</div>;
}
