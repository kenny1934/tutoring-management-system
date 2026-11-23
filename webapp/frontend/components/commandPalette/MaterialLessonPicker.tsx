"use client";
import { useState } from 'react';
import { useLocation } from '@/contexts/LocationContext';
import { usePaletteSearch } from './usePaletteSearch';
import { searchDate } from './search-filters';
import { sessionLabel } from './search-result-labels';
import type { SearchResults } from '@/types';
import styles from './MaterialSearch.module.css';

export function MaterialLessonPicker({ scope, onChoose, busy, error }: {
  scope: string; onChoose: (session: SearchResults['sessions'][number]) => void; busy: boolean; error?: string;
}) {
  const { selectedLocation } = useLocation();
  const [date, setDate] = useState(searchDate()), [term, setTerm] = useState('');
  const search = usePaletteSearch(term, selectedLocation, scope, !!date, true, { category: 'sessions', from_date: date, to_date: date });
  return <section aria-label="Choose a lesson" className={styles.lessonPicker}>
    <h3>Choose a lesson</h3>
    <div className={styles.bar}><label>Date<input aria-label="Assignment lesson date" type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <label>Student<input aria-label="Find assignment lesson" value={term} onChange={event => setTerm(event.target.value)} placeholder="Name, student ID or school" /></label></div>
    {search.loading && <p role="status">Finding lessons…</p>}
    {search.error && <p role="alert">Lessons could not load. <button onClick={search.retry}>Retry lessons</button></p>}
    {error && <p role="alert">{error}</p>}
    {search.results?.sessions.map(session => <button key={session.id} disabled={busy} className={styles.lessonResult} onClick={() => onChoose(session)}>
      <strong>{session.student_name}</strong> <span>{[session.grade, session.school].filter(Boolean).join(' · ')}</span><small>{sessionLabel(session)}</small>
    </button>)}
    {search.results && !search.results.sessions.length && <p>No lessons match this date and student search.</p>}
    {search.results?.has_more?.sessions && <button disabled={!!search.more && !search.more.error} onClick={() => void search.loadMore('sessions')}>{search.more?.error ? 'Retry more lessons' : 'More lessons'}</button>}
  </section>;
}
