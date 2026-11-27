'use client';
import { useCallback, useEffect, useState } from 'react';
import { coursewarePath, folderBrowse } from './material-paths';
import { positiveSearch } from './material-refinements';
import { defaultMaterialFilters, type MaterialFilters } from './material-workspace';
import type { CoursewareHistoryEntry } from './useCoursewareHistory';

export type SavedCoursewareSearch = CoursewareHistoryEntry & { id: string; name: string };
const LIMIT = 20, EVENT = 'csm-saved-courseware-change';
const keyFor = (scope: string) => `courseware-saved-searches:${scope}`;
export const savedSearchIdentity = (entry: CoursewareHistoryEntry) => JSON.stringify([entry.query.trim(), entry.filters]);
function parse(value: unknown): SavedCoursewareSearch | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== 'string' || !entry.id || entry.id.length > 80 || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 80
    || typeof entry.query !== 'string' || entry.query.length > 256 || coursewarePath(entry.query) || !entry.filters || typeof entry.filters !== 'object') return null;
  const raw = entry.filters as Record<string, unknown>;
  const filters = Object.fromEntries(Object.entries(defaultMaterialFilters()).map(([key, fallback]) => [key, typeof raw[key] === 'string' ? raw[key] : fallback])) as MaterialFilters;
  if (Object.values(filters).some(value => value.length > 512) || !['', 'center', 'developer', 'msa_scan'].includes(filters.share)
    || !['subtree', 'current'].includes(filters.folder_scope) || !['all', 'any'].includes(filters.match) || !['both', 'filename', 'content'].includes(filters.search_in)
    || !['relevance', 'recent'].includes(filters.sort) || [filters.modified_from, filters.modified_to].some(value => value && !/^\d{4}-\d{2}-\d{2}$/.test(value))
    || (!positiveSearch(entry.query, filters) && !folderBrowse(entry.query, filters))) return null;
  return { id: entry.id, name: entry.name.trim(), query: entry.query.trim(), filters };
}
function read(scope: string): SavedCoursewareSearch[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(keyFor(scope)) ?? '[]');
    if (!Array.isArray(data)) return [];
    const entries = data.map(parse).filter((entry): entry is SavedCoursewareSearch => !!entry);
    return [...new Map(entries.map(entry => [entry.id, entry])).values()].slice(0, LIMIT);
  } catch { return []; }
}

/** Only search conditions are stored, scoped to the current account, role and centre. */
export function useSavedCoursewareSearches(scope: string) {
  const [state, setState] = useState(() => ({ scope, entries: read(scope) }));
  const [error, setError] = useState('');
  useEffect(() => {
    const refresh = () => setState({ scope, entries: read(scope) });
    const storage = (event: StorageEvent) => { if (event.key === keyFor(scope) || event.key === null) refresh(); };
    const local = (event: Event) => { if ((event as CustomEvent<string>).detail === keyFor(scope)) refresh(); };
    refresh(); setError(''); window.addEventListener('storage', storage); window.addEventListener(EVENT, local);
    return () => { window.removeEventListener('storage', storage); window.removeEventListener(EVENT, local); };
  }, [scope]);
  const update = useCallback((change: (entries: SavedCoursewareSearch[]) => SavedCoursewareSearch[]) => {
    const entries = change(read(scope));
    try {
      if (entries.length) localStorage.setItem(keyFor(scope), JSON.stringify(entries));
      else localStorage.removeItem(keyFor(scope));
    } catch { setError('Could not update saved searches on this browser.'); return false; }
    setState({ scope, entries }); setError(''); window.dispatchEvent(new CustomEvent(EVENT, { detail: keyFor(scope) })); return true;
  }, [scope]);
  const save = useCallback((entry: CoursewareHistoryEntry, name: string) => {
    const candidate = parse({ ...entry, name, id: crypto.randomUUID() });
    if (!candidate) { setError('Choose a search or folder and a name of 80 characters or fewer.'); return false; }
    if (read(scope).length >= LIMIT) { setError('You can save up to 20 searches. Remove one to save another.'); return false; }
    return update(entries => entries.some(item => savedSearchIdentity(item) === savedSearchIdentity(candidate)) ? entries : [candidate, ...entries]);
  }, [scope, update]);
  const rename = useCallback((id: string, name: string) => {
    if (!name.trim() || name.trim().length > 80) return false;
    return update(entries => entries.map(entry => entry.id === id ? { ...entry, name: name.trim() } : entry));
  }, [update]);
  const remove = useCallback((id: string) => update(entries => entries.filter(entry => entry.id !== id)), [update]);
  return { entries: state.scope === scope ? state.entries : [], save, rename, remove, error };
}
