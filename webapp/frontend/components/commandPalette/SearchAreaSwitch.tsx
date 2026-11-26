"use client";
import { useId, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import styles from './SearchSurface.module.css';
export type SearchArea = 'records' | 'materials';
const areas = [{ id: 'records', label: 'Records' }, { id: 'materials', label: 'Courseware' }] as const;
export function SearchAreaSwitch({ value, onChange }: { value: SearchArea; onChange: (value: SearchArea) => void }) {
  const id = useId(), reduced = useReducedMotion();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return <div className={styles.areaBar}><div className={styles.areas} role="group" aria-label="Search area">
    {areas.map((area, index) => <button key={area.id} ref={button => { buttons.current[index] = button; }} type="button" aria-pressed={value === area.id} tabIndex={value === area.id ? 0 : -1}
      onClick={() => onChange(area.id)} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
        onChange(areas[next].id); buttons.current[next]?.focus();
      }}>
      {value === area.id && <motion.span aria-hidden className={styles.areaIndicator} layoutId={reduced ? undefined : id} transition={{ duration: reduced ? 0 : .16, ease: 'easeOut' }} />}
      <span>{area.label}</span>
    </button>)}
  </div></div>;
}
