"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import styles from "./NativePreview.module.css";

export interface NativeChartEntry {
  name: string;
  value: number;
  color: string;
}

/** Wide charts share a row with their legend; narrow charts keep reading order. */
export function NativeChartBody({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <div className={enabled ? styles.chartBody : "relative"}>{children}</div>;
}

/** One reading order and colour key across donut, bar and radial views. */
export function NativeChartLegend({ label, entries, total, selected, onSelect, summary, onOpen, actionLabel = "View students" }: {
  label: string;
  entries: NativeChartEntry[];
  total: number;
  selected: string | null;
  onSelect: (name: string | null) => void;
  summary: string;
  onOpen?: () => void;
  actionLabel?: string;
}) {
  const active = entries.find(entry => entry.name === selected);
  return <div className={styles.chartLegend}>
    <div className={styles.chartReadout}>
      <div aria-live="polite" aria-atomic="true">
        <span className={styles.chartReadoutName}>{active?.name ?? summary}</span>
        <span className={styles.chartReadoutValue}>{active ? `${active.value} ${active.value === 1 ? "student" : "students"} · ${total ? (active.value / total * 100).toFixed(1) : "0"}%` : `${total} students`}</span>
      </div>
      {active && onOpen && <button type="button" className={styles.chartOpen} onClick={onOpen}>{actionLabel}</button>}
    </div>
    <div className={styles.chartLegendRows} role="group" aria-label={label}>
      {entries.map(entry => <button key={entry.name} type="button"
        className={styles.chartLegendRow}
        aria-pressed={entry.name === selected}
        aria-label={`${entry.name}, ${entry.value} ${entry.value === 1 ? "student" : "students"}`}
        title={entry.name}
        onClick={() => onSelect(entry.name === selected ? null : entry.name)}>
        <span className={styles.chartSwatch} style={{ backgroundColor: entry.color }} aria-hidden="true" />
        <span className={styles.chartLegendName}>{entry.name}</span>
        <span className={styles.chartLegendCount} aria-hidden="true">{entry.value}</span>
      </button>)}
    </div>
  </div>;
}

/** Fade only the plot, with no remount, vertical travel or page-height change. */
export function NativeChartPlot({ enabled, signature, children }: { enabled: boolean; signature: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef(signature);
  useLayoutEffect(() => {
    const changed = previous.current !== signature;
    previous.current = signature;
    if (!enabled || !changed || !root.current?.animate) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;
    const animation = root.current.animate([{ opacity: .55 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
    const cancel = () => { if (reduced.matches) animation.cancel(); };
    reduced.addEventListener("change", cancel);
    return () => { animation.cancel(); reduced.removeEventListener("change", cancel); };
  }, [enabled, signature]);
  return <div ref={root} className={enabled ? styles.chartPlot : undefined} data-native-chart-plot={enabled || undefined}>{children}</div>;
}
