"use client";

import { useCallback, useEffect, useState } from 'react';
import { defaultMaterialFilters, type MaterialFilters } from './material-workspace';

export type CoursewareHistoryEntry = { query: string; filters: MaterialFilters };
const LIMIT = 5;
const storageKey = (scope: string) => `command-palette-courseware-history:${scope}`;
const identity = (entry: CoursewareHistoryEntry) => JSON.stringify([entry.query.toLowerCase(), entry.filters]);

function read(scope: string): CoursewareHistoryEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(scope)) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is CoursewareHistoryEntry => !!entry && typeof entry.query === 'string' && entry.query.trim().length >= 2 && entry.query.length <= 256
      && entry.filters && Object.keys(defaultMaterialFilters()).every(key => typeof entry.filters[key] === 'string'))
      .slice(0, LIMIT).map(entry => ({ query: entry.query, filters: Object.fromEntries(Object.keys(defaultMaterialFilters()).map(key => [key, entry.filters[key as keyof MaterialFilters]])) as MaterialFilters }));
  } catch { return []; }
}

/** History follows the current account, role and centre; document content is never stored. */
export function useCoursewareHistory(scope: string) {
  const [state, setState] = useState<{ scope: string; entries: CoursewareHistoryEntry[] }>(() => ({ scope, entries: read(scope) }));
  useEffect(() => { setState({ scope, entries: read(scope) }); }, [scope]);
  const update = useCallback((change: (entries: CoursewareHistoryEntry[]) => CoursewareHistoryEntry[]) => {
    const entries = change(read(scope));
    try {
      if (entries.length) localStorage.setItem(storageKey(scope), JSON.stringify(entries));
      else localStorage.removeItem(storageKey(scope));
    } catch { /* Search still works when browser storage is unavailable. */ }
    setState({ scope, entries });
  }, [scope]);
  const save = useCallback((entry: CoursewareHistoryEntry) => {
    if (entry.query.trim().length < 2 || entry.query.length > 256) return;
    update(entries => [entry, ...entries.filter(item => identity(item) !== identity(entry))].slice(0, LIMIT));
  }, [update]);
  const remove = useCallback((entry: CoursewareHistoryEntry) => update(entries => entries.filter(item => identity(item) !== identity(entry))), [update]);
  const clear = useCallback(() => update(() => []), [update]);
  return { entries: state.scope === scope ? state.entries : [], save, remove, clear };
}
