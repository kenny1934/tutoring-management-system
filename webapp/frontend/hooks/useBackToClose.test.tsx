import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hasStaleOverlayHistory, protectOverlayHistory, useBackToClose } from "./useBackToClose";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
  vi.spyOn(window.history, "back").mockImplementation(() => {});
  window.history.replaceState({}, "", "/sessions");
});
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.restoreAllMocks(); window.history.replaceState({}, "", "/"); });

it("does not remove a lesson's entry when its underlying phone sheet unmounts during rotation", () => {
  const sheet = renderHook(() => useBackToClose(true, vi.fn()));
  const sheetEntry = { ...window.history.state };
  const release = protectOverlayHistory("csmWideLesson", "lesson");
  try {
    window.history.pushState({ ...sheetEntry, csmWideLesson: "lesson" }, "");
    sheet.unmount(); act(() => vi.advanceTimersByTime(350));
    expect(window.history.back).not.toHaveBeenCalled();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(window.history.back).not.toHaveBeenCalled();
    expect(hasStaleOverlayHistory()).toBe(true);
  } finally { release(); }
  window.history.replaceState(sheetEntry, "");
  window.dispatchEvent(new PopStateEvent("popstate"));
  expect(window.history.back).toHaveBeenCalledOnce();
  window.history.replaceState({}, "");
  expect(hasStaleOverlayHistory()).toBe(false);
});

it("still removes an overlay above the workspace and preserves an active source sheet", () => {
  const source = renderHook(() => useBackToClose(true, vi.fn()));
  expect(hasStaleOverlayHistory()).toBe(false);
  const release = protectOverlayHistory("csmWideLesson", "lesson");
  try {
    const above = renderHook(() => useBackToClose(true, vi.fn()));
    above.unmount(); act(() => vi.advanceTimersByTime(350));
    expect(window.history.back).toHaveBeenCalledOnce();
  } finally { release(); source.unmount(); }
});

it.each([false, true])("preserves a pending app navigation when clicked after close: %s", afterClose => {
  const overlay = renderHook(() => useBackToClose(true, vi.fn()));
  const link = document.createElement("a"); link.href = "/students/12";
  link.onclick = event => event.preventDefault(); document.body.append(link);
  if (afterClose) overlay.unmount();
  fireEvent.click(link);
  if (!afterClose) overlay.unmount();
  act(() => vi.advanceTimersByTime(350));
  expect(window.history.back).not.toHaveBeenCalled();
  link.remove();
});

it("keeps a completed programmatic navigation even if it inherited the old overlay state", () => {
  const overlay = renderHook(() => useBackToClose(true, vi.fn()));
  const old = { ...window.history.state };
  overlay.unmount();
  window.history.pushState(old, "", "/students/12");
  act(() => vi.advanceTimersByTime(350));
  expect(window.history.back).not.toHaveBeenCalled();
});

it("still removes an ordinary closed sheet and ignores modified clicks", () => {
  const overlay = renderHook(() => useBackToClose(true, vi.fn()));
  const link = document.createElement("a"); link.href = "/students/12";
  link.onclick = event => event.preventDefault(); document.body.append(link);
  fireEvent.click(link, { ctrlKey: true }); overlay.unmount();
  act(() => vi.advanceTimersByTime(350));
  expect(window.history.back).toHaveBeenCalledOnce();
  link.remove();
});
