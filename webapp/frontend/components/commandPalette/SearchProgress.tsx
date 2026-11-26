"use client";

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import styles from './SearchProgress.module.css';

/** Delayed feedback avoids flashing on cache hits; the long-wait label is time-based, not a claimed backend stage. */
export function SearchProgress({ busy, requestKey, label, placeholders = 0 }: {
  busy: boolean; requestKey: string; label: string; placeholders?: number;
}) {
  return <SearchProgressState key={requestKey} busy={busy} label={label} placeholders={placeholders} />;
}

function SearchProgressState({ busy, label, placeholders }: { busy: boolean; label: string; placeholders: number }) {
  const [phase, setPhase] = useState<'waiting' | 'active' | 'slow'>('waiting');
  useEffect(() => {
    setPhase('waiting');
    if (!busy) return;
    const visible = setTimeout(() => setPhase('active'), 250);
    const slow = setTimeout(() => setPhase('slow'), 5000);
    return () => { clearTimeout(visible); clearTimeout(slow); };
  }, [busy]);
  if (!busy || phase === 'waiting') return null;
  return <div className={styles.root}>
    <div className={styles.track} aria-hidden="true"><span /></div>
    <div role="status" aria-live="polite" aria-atomic="true">
      <div className={styles.message}><Loader2 size={18} className={styles.spinner} aria-hidden="true" /><span>{phase === 'slow' ? label.replace(/^Searching/, 'Still searching') : label}</span></div>
      {phase === 'slow' && <p className={styles.detail}>This is taking longer than usual.</p>}
    </div>
    {placeholders > 0 && <div className={styles.placeholders} aria-hidden="true">{Array.from({ length: placeholders }, (_, index) => <div className={styles.row} key={index}><span className={styles.icon} /><div><span className={styles.title} /><span className={styles.line} /><span className={styles.shortLine} /></div></div>)}</div>}
  </div>;
}
