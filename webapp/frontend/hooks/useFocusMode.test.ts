import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, fireEvent } from "@testing-library/react";
import { useFocusMode } from "./useFocusMode";

const moveMouse = (clientX: number, clientY: number) => fireEvent.mouseMove(document, { clientX, clientY });
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

function renderFocusMode(enabled = true) {
  const hook = renderHook(({ on }) => useFocusMode(on), { initialProps: { on: enabled } });
  return hook;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useFocusMode", () => {
  it("starts off, and toggles on and off", () => {
    const { result } = renderFocusMode();
    expect(result.current.focusMode).toBe(false);
    act(() => result.current.toggleFocusMode());
    expect(result.current.focusMode).toBe(true);
    act(() => result.current.toggleFocusMode());
    expect(result.current.focusMode).toBe(false);
  });

  it("never turns on while it isn't enabled, as on a phone", () => {
    const { result } = renderFocusMode(false);
    act(() => result.current.toggleFocusMode());
    expect(result.current.focusMode).toBe(false);
  });

  it("reads as off while it isn't enabled, and comes back once it is", () => {
    const { result, rerender } = renderFocusMode();
    act(() => result.current.toggleFocusMode());
    rerender({ on: false });
    expect(result.current.focusMode).toBe(false);
    rerender({ on: true });
    expect(result.current.focusMode).toBe(true);
  });

  it("brings the header back once the mouse has rested at the very top for 200ms", () => {
    vi.useFakeTimers();
    const { result } = renderFocusMode();
    act(() => result.current.toggleFocusMode());
    moveMouse(500, 2);
    wait(199);
    expect(result.current.hoverHeader).toBe(false);
    wait(1);
    expect(result.current.hoverHeader).toBe(true);
  });

  it("still brings the header while the mouse stays within the top 48px", () => {
    vi.useFakeTimers();
    const { result } = renderFocusMode();
    act(() => result.current.toggleFocusMode());
    moveMouse(500, 2);
    wait(100);
    moveMouse(500, 40);
    wait(100);
    expect(result.current.hoverHeader).toBe(true);
  });

  it("forgets the top edge once the mouse moves further down before the header shows", () => {
    vi.useFakeTimers();
    const { result } = renderFocusMode();
    act(() => result.current.toggleFocusMode());
    moveMouse(500, 2);
    wait(100);
    moveMouse(500, 100);
    wait(500);
    expect(result.current.hoverHeader).toBe(false);
  });

  it("opens the sidebar once the mouse has rested within 48px of the left edge for 100ms", () => {
    vi.useFakeTimers();
    const { result } = renderFocusMode();
    act(() => result.current.toggleFocusMode());
    moveMouse(40, 300);
    wait(99);
    expect(result.current.hoverSidebar).toBe(false);
    wait(1);
    expect(result.current.hoverSidebar).toBe(true);
  });

  it("forgets the left edge once the mouse moves away before the sidebar opens", () => {
    vi.useFakeTimers();
    const { result } = renderFocusMode();
    act(() => result.current.toggleFocusMode());
    moveMouse(40, 300);
    wait(50);
    moveMouse(200, 300);
    wait(500);
    expect(result.current.hoverSidebar).toBe(false);
  });

  it("doesn't watch the mouse while focus mode is off", () => {
    vi.useFakeTimers();
    const { result } = renderFocusMode();
    moveMouse(2, 2);
    wait(500);
    expect(result.current.hoverHeader).toBe(false);
    expect(result.current.hoverSidebar).toBe(false);
  });

  it("closes both overlays when it leaves focus mode", () => {
    vi.useFakeTimers();
    const { result } = renderFocusMode();
    act(() => result.current.toggleFocusMode());
    moveMouse(2, 2);
    wait(200);
    expect(result.current.hoverHeader).toBe(true);
    expect(result.current.hoverSidebar).toBe(true);
    act(() => result.current.exitFocusMode());
    expect(result.current.focusMode).toBe(false);
    expect(result.current.hoverHeader).toBe(false);
    expect(result.current.hoverSidebar).toBe(false);
  });

  it("gives the same functions on every render, so what they're handed to doesn't re-render for nothing", () => {
    const { result, rerender } = renderFocusMode();
    const first = result.current;
    act(() => result.current.toggleFocusMode());
    rerender({ on: true });
    expect(result.current.exitFocusMode).toBe(first.exitFocusMode);
    expect(result.current.toggleFocusMode).toBe(first.toggleFocusMode);
    expect(result.current.setHoverHeader).toBe(first.setHoverHeader);
    expect(result.current.setHoverSidebar).toBe(first.setHoverSidebar);
  });
});
