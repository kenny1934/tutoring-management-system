"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api, type SearchResults } from "@/lib/api";
import { hasSearchConstraint, type SearchCategory, type SearchOptions } from './search-filters';

const categories: SearchCategory[] = ['students', 'sessions', 'enrollments', 'exams'];
const mergeRows = <T extends { id: number }>(existing: T[], next: T[]) => [...new Map([...existing, ...next].map(row => [row.id, row])).values()];

/** Permission scope, filters and query own every page, including work finishing after close. */
export function usePaletteSearch(term: string, location: string, scope: string, enabled: boolean, includeHistory = false, options: SearchOptions = {}) {
  const cache = useRef(new Map<string, SearchResults>());
  const offsets = useRef(new Map<string, Partial<Record<SearchCategory, number>>>());
  const [state, setState] = useState<{ key: string; loading: boolean; error: boolean } | null>(null);
  const [more, setMore] = useState<{ key: string; category: SearchCategory; error: boolean } | null>(null);
  const [attempt, retry] = useReducer(value => value + 1, 0);
  const [, render] = useReducer(value => value + 1, 0);
  const optionsKey = JSON.stringify(options);
  const key = JSON.stringify([scope, location, term, includeHistory, optionsKey]);
  const current = useRef({ key, enabled }); current.current = { key, enabled };
  const pageRequest = useRef<string | null>(null);
  const generation = useRef(0);
  const requests = useRef(new Map<AbortController, string>());
  const ready = term.trim().length >= 2 || (!term.trim() && hasSearchConstraint(options));
  useEffect(() => { cache.current.clear(); offsets.current.clear(); }, [scope]);

  useEffect(() => {
    generation.current += 1;
    setMore(null);
    if (!enabled || !ready) return;
    let active = true;
    const controller = new AbortController();
    const pending = requests.current; pending.set(controller, key);
    setState({ key, loading: true, error: false });
    const filters: SearchOptions = JSON.parse(optionsKey);
    const request = (extra?: SearchOptions, limit?: number) => {
      const params = { ...filters, ...extra };
      return api.stats.search(term, location, limit, includeHistory, Object.keys(params).length ? params : undefined, controller.signal);
    };
    const timer = setTimeout(async () => {
      try {
        const previous = cache.current.get(key);
        const data = await request();
        // Revalidate loaded pages too, so a return from editing doesn't retain stale tail rows.
        const nextOffsets: Partial<Record<SearchCategory, number>> = {};
        for (const category of categories) {
          if (!active) return;
          nextOffsets[category] = data[category].length;
          const count = offsets.current.get(key)?.[category] ?? previous?.[category].length ?? 0;
          if (count <= 5) continue;
          const rows: SearchResults[typeof category] = [];
          let hasMore = false;
          for (let offset = 0; offset < count;) {
            if (!active) return;
            const page = await request({ category, offset }, Math.min(50, count - offset));
            // Arrays share only their identity here; their concrete type remains tied to the category.
            (rows as { id: number }[]).push(...page[category]);
            hasMore = page.has_more?.[category] ?? false;
            offset += page[category].length;
            nextOffsets[category] = offset;
            if (!hasMore || !page[category].length) break;
          }
          Object.assign(data, { [category]: mergeRows([], rows as { id: number }[]) });
          data.has_more = { ...data.has_more, [category]: hasMore };
        }
        if (!active) return;
        cache.current.delete(key); cache.current.set(key, data); offsets.current.set(key, nextOffsets);
        if (cache.current.size > 20) { const oldest = cache.current.keys().next().value!; cache.current.delete(oldest); offsets.current.delete(oldest); }
        setState({ key, loading: false, error: false });
      } catch {
        if (active) setState({ key, loading: false, error: true });
      } finally { pending.delete(controller); }
    }, 200);
    return () => {
      active = false; clearTimeout(timer);
      for (const [request, owner] of pending) if (owner === key) { request.abort(); pending.delete(request); }
    };
  }, [key, term, location, scope, enabled, attempt, includeHistory, optionsKey, ready]);

  const loadMore = useCallback(async (category: SearchCategory) => {
    const previous = cache.current.get(key);
    if (!previous?.has_more?.[category] || !enabled || pageRequest.current?.startsWith(`${key}:`) || state?.loading) return;
    const version = generation.current;
    const requestId = `${key}:${version}`;
    pageRequest.current = requestId; setMore({ key, category, error: false });
    const controller = new AbortController(); requests.current.set(controller, key);
    try {
      const offset = offsets.current.get(key)?.[category] ?? previous[category].length;
      const page = await api.stats.search(term, location, 5, includeHistory, { ...JSON.parse(optionsKey), category, offset }, controller.signal);
      if (!current.current.enabled || current.current.key !== key || generation.current !== version) return;
      const data = { ...previous, has_more: { ...previous.has_more, [category]: !!page[category].length && (page.has_more?.[category] ?? false) } };
      Object.assign(data, { [category]: mergeRows(previous[category] as { id: number }[], page[category]) });
      cache.current.set(key, data);
      offsets.current.set(key, { ...offsets.current.get(key), [category]: offset + page[category].length });
      setMore(null); render();
    } catch {
      if (current.current.key === key && current.current.enabled && generation.current === version) setMore({ key, category, error: true });
    } finally { requests.current.delete(controller); if (pageRequest.current === requestId) pageRequest.current = null; }
  }, [key, term, location, enabled, includeHistory, optionsKey, state?.loading]);
  const results = cache.current.get(key) ?? null;
  const error = state?.key === key && state.error;
  const loading = enabled && ready && !error && (!results || (state?.key === key && state.loading));
  return { results, loading, error, retry, loadMore, more: more?.key === key ? more : null };
}
