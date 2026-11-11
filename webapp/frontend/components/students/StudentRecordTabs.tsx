"use client";

import { useId, useLayoutEffect, useRef, type ElementType } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import styles from "@/components/material/MaterialWorkspace.module.css";

export interface RecordTab<T extends string> { id: T; label: string; icon: ElementType; count?: number }

export function StudentRecordTabs<T extends string>({ tabs, activeTab, onChange }: {
  tabs: RecordTab<T>[]; activeTab: T; onChange: (tab: T) => void;
}) {
  const group = useId();
  const reduceMotion = useReducedMotion();
  const nav = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = nav.current;
    const active = root?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!root || !active) return;
    // Only reveal the tab horizontally. scrollIntoView also moves the record itself.
    const reveal = () => {
      const bounds = root.getBoundingClientRect(), tab = active.getBoundingClientRect();
      if (tab.left < bounds.left) root.scrollLeft -= bounds.left - tab.left + 6;
      else if (tab.right > bounds.right) root.scrollLeft += tab.right - bounds.right + 6;
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(root);
    observer.observe(active);
    return () => observer.disconnect();
  }, [activeTab]);

  return <LayoutGroup id={group}>
    <div ref={nav} role="tablist" aria-label="Student record" className={styles.materialRecordTabs}>
      {tabs.map((tab, index) => {
        const Icon = tab.icon;
        const active = tab.id === activeTab;
        return <button key={tab.id} type="button" role="tab" id={`record-tab-${tab.id}`}
          aria-selected={active} aria-controls="student-record-panel" tabIndex={active ? 0 : -1}
          onMouseDown={event => {
            // Native focus can scroll a sticky tab into its own reserved content inset.
            // Handling the compatibility mouse event also leaves touch panning native.
            event.preventDefault();
            event.currentTarget.focus({ preventScroll: true });
          }}
          onClick={() => onChange(tab.id)}
          onKeyDown={event => {
            let next: number;
            if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
            else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = tabs.length - 1;
            else return;
            event.preventDefault();
            onChange(tabs[next].id);
            nav.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus({ preventScroll: true });
          }}>
          {active && <motion.span aria-hidden="true" className={styles.materialRecordTabMarker}
            layoutId="active-record-tab" transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.2, 0.7, 0.2, 1] }} />}
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span>{tab.label}</span>
          {!!tab.count && <>{" "}<span className={styles.materialRecordTabCount}>{tab.count}</span></>}
        </button>;
      })}
    </div>
  </LayoutGroup>;
}
