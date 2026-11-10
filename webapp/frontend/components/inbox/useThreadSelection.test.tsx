import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MessageThread } from "@/types";
import { useThreadSelection } from "./useThreadSelection";

const thread = (id: number): MessageThread => ({ root_message: { id, from_tutor_id: 5, message: "Test message", priority: "Normal", created_at: "2026-11-11T09:00:00", is_read: true, is_pinned: false, like_count: 0, is_liked_by_me: false, reply_count: 0 }, replies: [], total_unread: 0 });
function deferred() { let resolve!: (value: MessageThread) => void; let reject!: (error: Error) => void;
  const promise = new Promise<MessageThread>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

describe("Inbox thread selection", () => {
  it("loads a notification destination without allowing an aborted request to select it", async () => {
    const { result } = renderHook(() => useThreadSelection("5:inbox"));
    const pending = deferred(), controller = new AbortController(); let loading!: Promise<void>;
    act(() => { loading = result.current.loadThread(() => pending.promise, controller.signal); });
    controller.abort();
    act(() => { void result.current.openThread(thread(11)); });
    await act(async () => { pending.resolve(thread(10)); await loading; });
    expect(result.current.selectedThread?.root_message.id).toBe(11);
    await act(async () => { await result.current.loadThread(() => Promise.resolve(thread(12))); });
    expect(result.current.selectedThread?.root_message.id).toBe(12);
  });
  it("keeps the latest conversation when an earlier full-thread request finishes last", async () => {
    const { result } = renderHook(() => useThreadSelection("5:sent"));
    const first = deferred(), next = deferred(); let a!: Promise<void>, b!: Promise<void>;
    act(() => { a = result.current.openThread(thread(1), () => first.promise); b = result.current.openThread(thread(2), () => next.promise); });
    await act(async () => { next.resolve(thread(2)); await b; first.resolve(thread(1)); await a; });
    expect(result.current.selectedThread?.root_message.id).toBe(2);
  });
  it("cannot reopen a conversation after Back or close", async () => {
    const { result } = renderHook(() => useThreadSelection("5:inbox")); const request = deferred(); let loading!: Promise<void>;
    act(() => { loading = result.current.openThread(thread(3), () => request.promise); });
    act(() => result.current.setSelectedThread(null));
    await act(async () => { request.resolve(thread(3)); await loading; });
    expect(result.current.selectedThread).toBeNull();
  });
  it("discards replies from the previous tutor or category", async () => {
    const { result, rerender } = renderHook(({ scope }) => useThreadSelection(scope), { initialProps: { scope: "5:sent" } });
    const request = deferred(); let loading!: Promise<void>;
    act(() => { loading = result.current.openThread(thread(4), () => request.promise); });
    rerender({ scope: "8:inbox" });
    await act(async () => { request.resolve(thread(4)); await loading; });
    expect(result.current.selectedThread).toBeNull();
  });
  it("also invalidates pending work when another action replaces the selected thread", async () => {
    const { result } = renderHook(() => useThreadSelection("5:sent")); const request = deferred(); let loading!: Promise<void>;
    act(() => { loading = result.current.openThread(thread(6), () => request.promise); result.current.setSelectedThread(thread(7)); });
    await act(async () => { request.resolve(thread(6)); await loading; });
    expect(result.current.selectedThread?.root_message.id).toBe(7);
    act(() => result.current.setSelectedThread(previous => previous && ({ ...previous, total_unread: 2 })));
    expect(result.current.selectedThread?.total_unread).toBe(2);
  });
  it("ignores errors from abandoned requests but reports a current request's error", async () => {
    const { result, unmount } = renderHook(() => useThreadSelection("5:sent")); const stale = deferred(); let loading!: Promise<void>;
    act(() => { loading = result.current.openThread(thread(8), () => stale.promise); });
    unmount(); stale.reject(new Error("Offline")); await expect(loading).resolves.toBeUndefined();
    const active = renderHook(() => useThreadSelection("9:sent"));
    await act(async () => { await expect(active.result.current.openThread(thread(9), () => Promise.reject(new Error("Offline")))).rejects.toThrow("Offline"); });
    expect(active.result.current.selectedThread?.root_message.id).toBe(9);
  });
});
