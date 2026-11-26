"use client";
import { createPortal } from "react-dom";
import { Filter, X } from 'lucide-react';
import type { SearchFilters as Filters } from './search-filters';
import { defaultSearchFilters } from './search-filters';
import styles from './SearchSurface.module.css';

export function SearchFilterControls({ filters, onChange, expanded, onToggle, includeHistory, onHistory, currentTutor, error, onBack, toolbarHost }: {
  toolbarHost?: HTMLElement | null; filters: Filters; onChange: (filters: Filters) => void; expanded: boolean; onToggle: () => void;
  includeHistory: boolean; onHistory: () => void; currentTutor?: number; error?: string; onBack?: () => void;
}) {
  const activeCount = Number(!!filters.category) + Number(filters.audience !== 'centre') + Number(filters.dates !== 'recent') + Number(!!filters.status) + Number(includeHistory) + Number(!!filters.student);
  const lesson = filters.category === 'sessions';
  const update = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const changeCategory = (category: Filters['category']) => update({ category, ...(category === 'exams' ? { audience: 'centre' as const } : {}), ...(category !== 'sessions' ? { dates: 'recent', from: '', to: '', status: '' } : {}) });
  const toolbarControls = (
    <div className={styles.filterBar}>
      <select aria-label="Search category" value={filters.category} onChange={event => changeCategory(event.target.value as Filters['category'])}>
        <option value="">All records</option><option value="students">Students</option><option value="sessions">Sessions</option><option value="enrollments">Enrolments</option><option value="exams">Exams</option>
      </select>
      <select aria-label="Search scope" value={filters.audience} onChange={event => update({ audience: event.target.value as Filters['audience'] })}>
        <option value="centre">Centre</option><option value="my" disabled={!currentTutor || filters.category === 'exams'}>My records</option>
      </select>
      <button className={styles.filterToggle} title="Filter dates, status and history" aria-label="Search filters" aria-expanded={expanded} onClick={onToggle}><Filter size={14} /><span>Filters</span>{activeCount > 0 && <span aria-label={`${activeCount} active filters`}>{activeCount}</span>}</button>
    </div>
  );
  return <>
    {toolbarHost && createPortal(toolbarControls, toolbarHost)}
    <div className={styles.filters} hidden={!!toolbarHost && !expanded && !filters.student && !error && filters.dates === "recent" && !includeHistory}>
    {!toolbarHost && toolbarControls}
    {expanded && <div className={styles.filterFields}>
      {toolbarHost && <div className={styles.mobileScopes}><label>Category<select aria-label="Filter search category" value={filters.category} onChange={event => changeCategory(event.target.value as Filters['category'])}><option value="">All records</option><option value="students">Students</option><option value="sessions">Sessions</option><option value="enrollments">Enrolments</option><option value="exams">Exams</option></select></label><label>Scope<select aria-label="Filter search scope" value={filters.audience} onChange={event => update({ audience: event.target.value as Filters['audience'] })}><option value="centre">Centre</option><option value="my" disabled={!currentTutor || filters.category === 'exams'}>My records</option></select></label></div>}
      <label>Session dates<select aria-label="Session dates" value={filters.dates} onChange={event => update({ category: 'sessions', dates: event.target.value as Filters['dates'] })}>
        <option value="recent">{includeHistory ? "All dates" : "Within 30 days"}</option><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="week">This week</option><option value="custom">Date range</option>
      </select></label>
      {filters.dates === 'custom' && <><label>From<input aria-label="From date" type="date" value={filters.from} onChange={event => update({ category: 'sessions', from: event.target.value })} /></label><label>To<input aria-label="To date" type="date" value={filters.to} onChange={event => update({ category: 'sessions', to: event.target.value })} /></label></>}
      <label>Session status<select aria-label="Session status" value={lesson ? filters.status : ''} onChange={event => update({ category: 'sessions', status: event.target.value })}>
        <option value="">Any status</option><option value="unmarked">Awaiting attendance</option><option value="pending-makeups">Pending make-up</option><option value="Scheduled">Scheduled</option><option value="Trial Class">Trial class</option><option value="Make-up Class">Make-up class</option><option value="Attended">Attended</option><option value="Attended (Make-up)">Attended (make-up)</option><option value="No Show">No show</option><option value="Cancelled">Cancelled</option>
      </select></label>
      <button aria-pressed={includeHistory} onClick={onHistory}>Include history</button>
      <button onClick={() => { onChange(defaultSearchFilters()); if (includeHistory) onHistory(); }}>Reset filters</button>
    </div>}
    {!expanded && <div className={styles.filterSummary}>
      <span>{filters.dates === 'recent' ? (includeHistory ? 'All dates and enrolments' : 'Sessions within 30 days · Current enrolments') : filters.dates === 'custom' ? `${filters.from || 'Any start'} to ${filters.to || 'Any end'}` : filters.dates === 'week' ? 'This week' : filters.dates === 'today' ? 'Today' : 'Tomorrow'}</span>
      <button aria-pressed={includeHistory} onClick={onHistory}>Include history</button>
    </div>}
    {filters.student && <div className={styles.filterSummary}><span>{filters.student.name}</span><button aria-label="Back to search results" onClick={onBack ?? (() => update({ student: undefined }))}><X size={12} />Back to results</button></div>}
    {error && <p role="alert" className={styles.filterError}>{error}</p>}
  </div></>;
}
