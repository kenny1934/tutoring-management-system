"use client";
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/controls';
import { Modal } from '@/components/ui/modal';
import { materialPages } from './material-pages';
import { materialAliasPath, type CoursewareSelection } from './MaterialSearch';
import type { MaterialBasketEntry } from './material-workspace';
import styles from './MaterialSearch.module.css';
const SessionSelector = dynamic(() => import('@/components/sessions/SessionSelectorModal').then(m => m.SessionSelectorModal), { ssr: false });

export function MaterialBasket({ entries, onChange, onPick }: { onPick?: (files: CoursewareSelection[]) => void; entries: MaterialBasketEntry[]; onChange: (entries: MaterialBasketEntry[]) => void }) {
  const [reviewing, setReviewing] = useState(false), [calendar, setCalendar] = useState(false), [ready, setReady] = useState(false);
  const valid = entries.length > 0 && entries.every(entry => materialPages(entry.pages, entry.material.page_count));
  if (!entries.length) return null;
  const close = () => { setCalendar(false); setReady(false); setReviewing(false); };
  return <>
    <div className={styles.basketBar} role="group" aria-label="Selected courseware">
      <span>{entries.length} selected</span><Button size="sm" variant="secondary" onClick={() => setReviewing(true)}>{onPick ? "Review selection" : "Review and assign"}</Button><Button size="sm" variant="quiet" onClick={() => { close(); onChange([]); }}>Clear selection</Button>
    </div>
    {reviewing && !ready && <Modal isOpen title={onPick ? "Add selected courseware" : "Assign selected courseware"} size="md" onClose={close} footer={<Button disabled={!valid} loading={calendar} onClick={() => { if (onPick && valid) { onPick(entries.map(entry => ({ path: materialAliasPath(entry.material.nas_path), pages: entry.pages, pageCount: entry.material.page_count!, title: entry.material.filename }))); close(); onChange([]); } else setCalendar(true); }}>{onPick ? "Add to lesson" : "Choose sessions"}</Button>}>
      {entries.map(entry => <div key={entry.material.file_id} className={styles.basketItem}>
        <strong>{entry.material.filename}</strong>
        <label>Pages<input aria-label={`Pages for ${entry.material.filename}`} value={entry.pages} placeholder="1-3, 5" onChange={event => onChange(entries.map(item => item.material.file_id === entry.material.file_id ? { ...item, pages: event.target.value } : item))} /></label>
        <Button variant="quiet" size="sm" aria-label={`Remove ${entry.material.filename}`} onClick={() => onChange(entries.filter(item => item.material.file_id !== entry.material.file_id))}>Remove</Button>
        {!entry.material.page_count ? <p>Open this PDF to check its page count.</p> : !materialPages(entry.pages, entry.material.page_count) && <p role="alert">Choose pages within this PDF (1–{entry.material.page_count}).</p>}
      </div>)}
    </Modal>}
    {calendar && valid && <SessionSelector isOpen onReady={() => setReady(true)} files={entries.map(entry => ({ path: materialAliasPath(entry.material.nas_path), pages: entry.pages, pageCount: entry.material.page_count ?? undefined }))}
      onClose={() => { setCalendar(false); setReady(false); }} onAssignComplete={() => { close(); onChange([]); }} />}
  </>;
}
