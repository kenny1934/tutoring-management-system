"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import styles from "@/components/material/MaterialWorkspace.module.css";

/** Stays mounted beside the edit action, so confirmation never moves the heading. */
export function RecordSaveFeedback({ revision }: { revision: number }) {
  const [visibleRevision, setVisibleRevision] = useState(0);
  useEffect(() => {
    if (!revision) return;
    const timer = setTimeout(() => setVisibleRevision(revision), Math.max(0, revision + 2600 - Date.now()));
    return () => clearTimeout(timer);
  }, [revision]);
  const visible = revision > 0 && visibleRevision !== revision && Date.now() < revision + 2600;
  return <span className={styles.materialRecordSavedSlot} role="status" aria-live="polite" aria-atomic="true">
    <span className={styles.materialRecordSaved} data-visible={visible}>
      {visible && <><Check size={14} aria-hidden="true" /><span className={styles.materialRecordSavedText}>Saved</span></>}
    </span>
  </span>;
}

/** Return keyboard focus when the Save button is replaced by its Edit action. */
export function useRecordEditReturn(editing: boolean, saving: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const ownedFocus = useRef(false);
  useEffect(() => {
    if (!editing) return;
    const remember = () => { ownedFocus.current = !!ref.current?.contains(document.activeElement); };
    document.addEventListener("focusin", remember);
    remember();
    return () => document.removeEventListener("focusin", remember);
  }, [editing]);
  useEffect(() => {
    if (editing || saving) return;
    if (ownedFocus.current && (!document.activeElement || document.activeElement === document.body)) {
      ref.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    }
    ownedFocus.current = false;
  }, [editing, saving]);
  return ref;
}
