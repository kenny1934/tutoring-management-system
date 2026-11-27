import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useCoursewareHistory } from './useCoursewareHistory';
import { defaultMaterialFilters } from './material-workspace';

beforeEach(() => localStorage.clear());
it('keeps history separate by identity, role and centre, deduplicates and clears it', () => {
  const entry = { query: '"a term"', filters: { ...defaultMaterialFilters(), share: 'msa_scan' } };
  const hook = renderHook(({ scope }) => useCoursewareHistory(scope), { initialProps: { scope: 'user1:Tutor:MSA' } });
  act(() => hook.result.current.save(entry)); act(() => hook.result.current.save(entry));
  expect(hook.result.current.entries).toEqual([entry]);
  hook.rerender({ scope: 'user1:Tutor:MSB' }); expect(hook.result.current.entries).toEqual([]);
  hook.rerender({ scope: 'user2:Tutor:MSA' }); expect(hook.result.current.entries).toEqual([]);
  hook.rerender({ scope: 'user1:Admin:MSA' }); expect(hook.result.current.entries).toEqual([]);
  hook.rerender({ scope: 'user1:Tutor:MSA' }); expect(hook.result.current.entries).toEqual([entry]);
  act(() => hook.result.current.clear()); expect(hook.result.current.entries).toEqual([]);
  hook.unmount();
  expect(renderHook(() => useCoursewareHistory('user1:Tutor:MSA')).result.current.entries).toEqual([]);
});
it('handles corrupt or unavailable browser storage without breaking search', () => {
  localStorage.setItem('command-palette-courseware-history:corrupt', '[{"query":"valid query","filters":null}]');
  const hook = renderHook(() => useCoursewareHistory('corrupt'));
  expect(hook.result.current.entries).toEqual([]);
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('unavailable'); });
  act(() => hook.result.current.save({ query: 'fractions', filters: defaultMaterialFilters() }));
  expect(hook.result.current.entries).toHaveLength(1);
  spy.mockRestore();
});

it('migrates saved searches from before refinements and retains phrase-only searches', () => {
  localStorage.setItem('command-palette-courseware-history:legacy', JSON.stringify([{ query: 'algebra', filters: { share: 'center', ext: '.pdf', modified: '', folder: '', sort: 'relevance' } }]));
  const hook = renderHook(() => useCoursewareHistory('legacy'));
  expect(hook.result.current.entries[0]).toEqual({ query: 'algebra', filters: { ...defaultMaterialFilters(), share: 'center', ext: '.pdf' } });
  const phrase = { query: '', filters: { ...defaultMaterialFilters(), exact_phrase: 'a term', exclude_words: 'draft', modified_to: '2025-12-31' } };
  act(() => hook.result.current.save(phrase));
  hook.unmount();
  expect(renderHook(() => useCoursewareHistory('legacy')).result.current.entries[0]).toEqual(phrase);
});

it('retains folder-only visits and copied file paths longer than a text query', () => {
  const hook = renderHook(() => useCoursewareHistory('folders'));
  const folder = { query: '', filters: { ...defaultMaterialFilters(), share: 'center', folder: 'English/DSE' } };
  const file = { query: '[Center]\\' + 'Long folder\\'.repeat(25) + 'Example.pdf', filters: defaultMaterialFilters() };
  act(() => hook.result.current.save(folder));
  act(() => hook.result.current.save(file));
  hook.unmount();
  expect(renderHook(() => useCoursewareHistory('folders')).result.current.entries).toEqual([file, folder]);
});


it('remembers current-folder search while defaulting old history to include descendants', () => {
  const hook = renderHook(() => useCoursewareHistory('folder-scope'));
  const entry = { query: 'algebra', filters: { ...defaultMaterialFilters(), share: 'center', folder: 'English/DSE', folder_scope: 'current' } };
  act(() => hook.result.current.save(entry));
  hook.unmount();
  expect(renderHook(() => useCoursewareHistory('folder-scope')).result.current.entries[0]).toEqual(entry);
  const legacy = { ...entry.filters };
  delete (legacy as Partial<typeof legacy>).folder_scope;
  localStorage.setItem('command-palette-courseware-history:old-scope', JSON.stringify([{ query: 'algebra', filters: legacy }]));
  expect(renderHook(() => useCoursewareHistory('old-scope')).result.current.entries[0].filters.folder_scope).toBe('subtree');
});
