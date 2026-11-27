"use client";

import { useCallback, useEffect, useState } from 'react';
import { coursewarePath, folderBrowse } from './material-paths';
import { positiveSearch } from './material-refinements';
import { defaultMaterialFilters, type MaterialFilters } from './material-workspace';

export type CoursewareHistoryEntry = { query: string; filters: MaterialFilters };
const LIMIT = 5;
const storageKey = (scope: string) => `command-palette-courseware-history:${scope}`;
const identity = (entry: CoursewareHistoryEntry) => JSON.stringify([entry.query.toLowerCase(), entry.filters]);

function read(scope: string): CoursewareHistoryEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(scope)) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.flatMap(entry => {
      if (!entry || typeof entry.query !== 'string' || entry.query.length > (coursewarePath(entry.query) ? 2048 : 256) || !entry.filters || typeof entry.filters !== 'object') return [];
      const defaults = defaultMaterialFilters();
      // Older saved searches do not have refinement fields yet.
      const filters = Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, typeof entry.filters[key] === 'string' ? entry.filters[key] : fallback])) as MaterialFilters;
      if ((!positiveSearch(entry.query, filters) && !folderBrowse(entry.query, filters)) || Object.values(filters).some(value => value.length > 512)
        || !['subtree', 'current'].includes(filters.folder_scope) || !['all', 'any'].includes(filters.match) || !['both', 'filename', 'content'].includes(filters.search_in)
        || [filters.modified_from, filters.modified_to].some(value => value && !/^\d{4}-\d{2}-\d{2}$/.test(value))) return [];
      return [{ query: entry.query, filters }];
    }).slice(0, LIMIT);
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
    if ((!positiveSearch(entry.query, entry.filters) && !folderBrowse(entry.query, entry.filters)) || entry.query.length > (coursewarePath(entry.query) ? 2048 : 256)) return;
    update(entries => [entry, ...entries.filter(item => identity(item) !== identity(entry))].slice(0, LIMIT));
  }, [update]);
  const remove = useCallback((entry: CoursewareHistoryEntry) => update(entries => entries.filter(item => identity(item) !== identity(entry))), [update]);
  const clear = useCallback(() => update(() => []), [update]);
  return { entries: state.scope === scope ? state.entries : [], save, remove, clear };
}
