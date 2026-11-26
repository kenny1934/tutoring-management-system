"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/controls";
import { useIsMobile } from "@/hooks/useIsMobile";
import styles from "./SelectionActionBar.module.css";

/** Keep today's selected-session actions in reach while a phone's list scrolls. */
export function SelectionActionBar({ count, onClear, children }: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  const onPhone = useIsMobile();
  const bar = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!onPhone || !bar.current) return;
    const element = bar.current;
    const measure = () => setHeight(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onPhone]);

  const actions = (
    <div ref={bar} role="region" aria-label="Selected session actions"
      className={`${styles.bar} ${onPhone ? styles.floating : ""}`}>
      <div className={styles.summary}>
        <span aria-live="polite">{count} selected</span>
        <Button size="sm" variant="quiet" icon={X} onClick={onClear} aria-label="Clear selection">Clear</Button>
      </div>
      <div className={styles.actions}>{children}</div>
    </div>
  );

  if (!onPhone) return actions;
  // The card and dashboard animate, so fixed positioning needs a body portal.
  // Leave room in the list to scroll its last lesson above the floating tray.
  return <>
    <div aria-hidden="true" style={{ height: height + 16 }} />
    {createPortal(actions, document.body)}
  </>;
}
