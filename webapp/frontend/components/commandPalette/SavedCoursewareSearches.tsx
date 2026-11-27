'use client';
import { useState } from 'react';
import { Bookmark, Check, Pencil, X } from 'lucide-react';
import type { SavedCoursewareSearch } from './useSavedCoursewareSearches';
import type { CoursewareHistoryEntry } from './useCoursewareHistory';
import { filterChips } from './material-refinements';
import { IconButton } from '@/components/controls';
import styles from './MaterialSearch.module.css';

export function SavedCoursewareSearches({ entries, sources, onRecall, onRename, onRemove }: {
  entries: SavedCoursewareSearch[]; sources: Record<string, string>; onRecall: (entry: CoursewareHistoryEntry) => void;
  onRename: (id: string, name: string) => boolean; onRemove: (id: string) => boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null), [name, setName] = useState('');
  if (!entries.length) return null;
  return <section className={styles.savedList} aria-label="Saved courseware searches">
    <div className={styles.historyHeader}><span>Saved searches</span><small>On this browser</small></div>
    {entries.map(entry => {
      const unavailable = !!entry.filters.share && !sources[entry.filters.share];
      return <div key={entry.id} className={styles.historyRow}>
        {editing === entry.id ? <form className={styles.savedRename} onSubmit={event => { event.preventDefault(); if (onRename(entry.id, name)) setEditing(null); }}>
          <input aria-label="Saved search name" value={name} maxLength={80} autoFocus onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setEditing(null); } }} />
          <IconButton type="submit" label="Save search name" icon={Check} size="sm" disabled={!name.trim()} />
          <IconButton type="button" label="Cancel rename" icon={X} size="sm" onClick={() => setEditing(null)} />
        </form> : <>
          <button type="button" data-material-result className={styles.result} disabled={unavailable} onClick={() => onRecall(entry)} aria-label={`Run saved search ${entry.name}`}>
            <Bookmark size={16} /><span><strong>{entry.name}</strong><small>{unavailable ? 'Source unavailable' : [entry.query, ...filterChips(entry.filters, sources).map(chip => chip.label), entry.filters.folder_scope === 'current' ? 'Current folder only' : ''].filter(Boolean).join(' · ')}</small></span>
          </button>
          <IconButton label={`Rename saved search ${entry.name}`} icon={Pencil} size="sm" onClick={() => { setName(entry.name); setEditing(entry.id); }} />
          <IconButton label={`Remove saved search ${entry.name}`} icon={X} size="sm" onClick={() => onRemove(entry.id)} />
        </>}
      </div>;
    })}
  </section>;
}
