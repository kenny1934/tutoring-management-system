import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResults } from "@/lib/api";
import { usePaletteSearch } from "./usePaletteSearch";
const search = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: { stats: { search } } }));
const result = (name: string): SearchResults => ({ students: [{ id: 1, student_name: name, school_student_id: null, school: null, grade: null, phone: null }], sessions: [], enrollments: [], exams: [] });
const deferred = () => { let resolve!: (data: SearchResults) => void; const promise = new Promise<SearchResults>(yes => { resolve = yes; }); return { promise, resolve }; };
const tick = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(200); }); };
beforeEach(() => { vi.useFakeTimers(); search.mockReset(); });
afterEach(() => vi.useRealTimers());

describe("Global search responses", () => {
  it("ignores the old query when its response finishes last", async () => {
    const a = deferred(), b = deferred(); search.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const view = renderHook(({ term }) => usePaletteSearch(term, "MSA", "tutor-5", true), { initialProps: { term: "older" } });
    await tick(); view.rerender({ term: "newer" }); expect(view.result.current.results).toBeNull(); await tick();
    await act(async () => b.resolve(result("Newer"))); await act(async () => a.resolve(result("Older")));
    expect(view.result.current.results?.students[0].student_name).toBe("Newer");
  });
  it("keeps scopes and locations separate and discards work after close", async () => {
    const a = deferred(); search.mockReturnValueOnce(a.promise).mockResolvedValue(result("Current"));
    const view = renderHook(({ location, scope, enabled }) => usePaletteSearch("name", location, scope, enabled), { initialProps: { location: "MSA", scope: "5", enabled: true } });
    await tick(); view.rerender({ location: "MSB", scope: "8", enabled: true }); await tick();
    await act(async () => a.resolve(result("Other scope"))); expect(view.result.current.results?.students[0].student_name).toBe("Current");
    expect(search).toHaveBeenLastCalledWith("name", "MSB", undefined, false, undefined, expect.any(AbortSignal));
    const late = deferred(); search.mockReturnValueOnce(late.promise);
    view.rerender({ location: "MSA", scope: "8", enabled: true }); await tick(); view.rerender({ location: "MSA", scope: "8", enabled: false });
    await act(async () => late.resolve(result("After close"))); expect(view.result.current.results).toBeNull();
  });
  it("returns cached matching results immediately when reopening, without accepting another query's rows", async () => {
    search.mockResolvedValue(result("Saved")); const view = renderHook(({ term, enabled }) => usePaletteSearch(term, "MSA", "5", enabled), { initialProps: { term: "saved", enabled: true } });
    await tick(); expect(view.result.current.results?.students[0].student_name).toBe("Saved");
    view.rerender({ term: "other", enabled: true }); expect(view.result.current.results).toBeNull();
    view.rerender({ term: "saved", enabled: false }); expect(view.result.current.results?.students[0].student_name).toBe("Saved");
    view.rerender({ term: "saved", enabled: true }); expect(view.result.current.results?.students[0].student_name).toBe("Saved");
  });
  it("reports a failed search and allows an explicit retry", async () => {
    search.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(result("Recovered"));
    const view = renderHook(() => usePaletteSearch("retry", "MSA", "5", true)); await tick();
    expect(view.result.current.error).toBe(true); expect(view.result.current.loading).toBe(false);
    act(() => view.result.current.retry()); await tick(); expect(view.result.current.error).toBe(false);
    expect(view.result.current.results?.students[0].student_name).toBe("Recovered");
  });
  it("does not search while closed or before two characters", async () => {
    const view = renderHook(({ enabled }) => usePaletteSearch("a", "MSA", "5", enabled), { initialProps: { enabled: false } });
    await tick(); view.rerender({ enabled: true }); await tick(); expect(search).not.toHaveBeenCalled();
  });
});

it("separates history responses from the current-record search cache", async () => {
  const current = deferred(), history = deferred(); search.mockReturnValueOnce(current.promise).mockReturnValueOnce(history.promise);
  const view = renderHook(({ includeHistory }) => usePaletteSearch("name", "MSA", "5", true, includeHistory), { initialProps: { includeHistory: false } });
  await tick(); view.rerender({ includeHistory: true }); await tick();
  await act(async () => history.resolve(result("History"))); await act(async () => current.resolve(result("Current")));
  expect(view.result.current.results?.students[0].student_name).toBe("History");
  expect(search).toHaveBeenLastCalledWith("name", "MSA", undefined, true, undefined, expect.any(AbortSignal));
  view.rerender({ includeHistory: false }); expect(view.result.current.results).toBeNull();
});

describe('Search pagination', () => {
  const page = (ids: number[], hasMore: boolean): SearchResults => ({ students: ids.map(id => ({ id, student_name: `Learner ${id}`, school_student_id: null, school: null, grade: null, phone: null })), sessions: [], enrollments: [], exams: [], has_more: { students: hasMore } });
  it('extends only the chosen category, deduplicates identities, and revalidates the loaded range on reopening', async () => {
    search.mockResolvedValueOnce(page([1, 2, 3, 4, 5], true)).mockResolvedValueOnce(page([5, 6, 7], false));
    const view = renderHook(({ enabled }) => usePaletteSearch('learner', 'MSA', '5', enabled), { initialProps: { enabled: true } });
    await tick(); await act(async () => view.result.current.loadMore('students'));
    expect(search).toHaveBeenLastCalledWith('learner', 'MSA', 5, false, { category: 'students', offset: 5 }, expect.any(AbortSignal));
    expect(view.result.current.results?.students.map(row => row.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(view.result.current.results?.has_more?.students).toBe(false);
    view.rerender({ enabled: false });
    search.mockResolvedValueOnce(page([1, 2, 3, 4, 5], true)).mockResolvedValueOnce(page([1, 2, 3, 4, 5, 6, 7], false));
    view.rerender({ enabled: true }); await tick();
    expect(view.result.current.results?.students).toHaveLength(7);
    expect(search).toHaveBeenLastCalledWith('learner', 'MSA', 8, false, { category: 'students', offset: 0 }, expect.any(AbortSignal));
  });
  it('retains results after a failed page and retries without repeating the initial search', async () => {
    search.mockResolvedValueOnce(page([1, 2, 3, 4, 5], true)).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(page([6], false));
    const view = renderHook(() => usePaletteSearch('learner', 'MSA', '5', true)); await tick();
    await act(async () => view.result.current.loadMore('students'));
    expect(view.result.current.results?.students).toHaveLength(5); expect(view.result.current.error).toBeFalsy(); expect(view.result.current.more?.error).toBe(true);
    await act(async () => view.result.current.loadMore('students')); expect(view.result.current.results?.students).toHaveLength(6);
  });
  it('discards an extra page when the scope changes before it arrives', async () => {
    const late = deferred(); search.mockResolvedValueOnce(page([1, 2, 3, 4, 5], true)).mockReturnValueOnce(late.promise).mockResolvedValueOnce(page([10], false));
    const view = renderHook(({ scope }) => usePaletteSearch('learner', 'MSA', scope, true), { initialProps: { scope: '5' } }); await tick();
    let pending!: Promise<void>; act(() => { pending = view.result.current.loadMore('students'); });
    const signal = search.mock.calls.at(-1)![5] as AbortSignal;
    view.rerender({ scope: '8' }); expect(signal.aborted).toBe(true); await tick();
    await act(async () => { late.resolve(page([6], false)); await pending; });
    expect(view.result.current.results?.students.map(row => row.id)).toEqual([10]);
  });
  it('allows a filter-only search without sending a blank unfiltered request', async () => {
    search.mockResolvedValue(page([], false));
    const view = renderHook(({ filtered }) => usePaletteSearch('', 'MSA', '5', true, false, filtered ? { category: 'sessions', from_date: '2026-11-23' } : {}), { initialProps: { filtered: false } });
    await tick(); expect(search).not.toHaveBeenCalled(); view.rerender({ filtered: true }); await tick();
    expect(search).toHaveBeenCalledWith('', 'MSA', undefined, false, { category: 'sessions', from_date: '2026-11-23' }, expect.any(AbortSignal));
  });
});

it('aborts superseded record searches and ignores late results after close', async () => {
 const a=deferred();search.mockReturnValueOnce(a.promise).mockResolvedValueOnce(result('New'));
 const view=renderHook(({term,enabled})=>usePaletteSearch(term,'MSA','5',enabled),{initialProps:{term:'older',enabled:true}});
 await tick();const oldSignal=search.mock.calls[0][5] as AbortSignal;expect(oldSignal.aborted).toBe(false);
 view.rerender({term:'newer',enabled:true});expect(oldSignal.aborted).toBe(true);await tick();
 view.rerender({term:'newer',enabled:false});await act(async()=>a.resolve(result('Old')));
 expect(view.result.current.results?.students[0].student_name).toBe('New');
});
