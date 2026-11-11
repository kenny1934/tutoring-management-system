import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNativeSessionDetail } from "./useNativeSessionDetail";

let main: HTMLElement, source: HTMLElement, inner: HTMLElement;
function Detail({ enabled = true, asSheet = false, from = source, onClose = vi.fn() }) {
  const detail = useNativeSessionDetail({ enabled, source: from, asSheet, positioned: true, zIndex: 9999, onClose });
  return <div ref={detail.setSurface}><div ref={detail.identity}>Existing student and badges</div><button onClick={detail.close}>Close detail</button></div>;
}
beforeEach(() => {
  vi.useFakeTimers();
  main = document.createElement("main"); main.id = "main-content";
  main.style.overflow = "auto"; main.inert = false;
  source = document.createElement("div");
  source.innerHTML = '<span data-native-session-identity>Existing student</span>';
  inner = document.createElement("div");
  Object.defineProperty(inner, "scrollHeight", { value: 1000 });
  inner.append(source); main.append(inner); document.body.append(main);
  main.scrollTop = 167; inner.scrollTop = 92;
});
afterEach(() => { main.remove(); vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Dashboard detail continuity", () => {
  it("leaves Original interactions and scroll styles alone", () => {
    const close = vi.fn(); render(<Detail enabled={false} onClose={close} />);
    expect(main.style.overflow).toBe("auto"); expect(main.inert).toBe(false);
    fireEvent.click(screen.getByText("Close detail")); expect(close).toHaveBeenCalledTimes(1);
  });
  it("preserves both reading positions and restores the prior styles after the phone sheet closes", () => {
    const { unmount } = render(<Detail asSheet />);
    expect(main.inert).toBe(true); expect(main.style.overflow).toBe("hidden");
    const wheel = new Event("wheel", { bubbles: true, cancelable: true });
    expect(inner.dispatchEvent(wheel)).toBe(false);
    main.scrollTop = 0; inner.scrollTop = 0;
    unmount();
    expect(main.scrollTop).toBe(167); expect(inner.scrollTop).toBe(92);
    expect(main.style.overflow).toBe("auto"); expect(main.inert).toBe(false);
    expect(main.dataset.nativeSessionOpen).toBeUndefined();
  });
  it("leaves the desktop page undimmed and scrollable while details are open", () => {
    const { unmount } = render(<Detail />);
    expect(main.dataset.nativeSessionOpen).toBeUndefined();
    expect(main.style.overflow).toBe("auto"); expect(main.inert).toBe(false);
    expect(inner.dispatchEvent(new Event("wheel", { bubbles: true, cancelable: true }))).toBe(true);
    main.scrollTop = 250; inner.scrollTop = 130;
    unmount();
    expect(main.scrollTop).toBe(250); expect(inner.scrollTop).toBe(130);
  });
  it("finishes the desktop exit once and does not let a stale exit close a newly selected row", () => {
    const close = vi.fn(); const { rerender } = render(<Detail onClose={close} />);
    fireEvent.click(screen.getByText("Close detail")); fireEvent.click(screen.getByText("Close detail"));
    act(() => vi.advanceTimersByTime(70)); expect(close).not.toHaveBeenCalled();
    const next = document.createElement("div"); main.append(next);
    rerender(<Detail from={next} onClose={close} />);
    act(() => vi.advanceTimersByTime(300)); expect(close).not.toHaveBeenCalled();
    expect(main.dataset.nativeSessionOpen).toBeUndefined();
    fireEvent.click(screen.getByText("Close detail"));
    act(() => vi.advanceTimersByTime(140)); expect(close).toHaveBeenCalledTimes(1);
  });
  it("closes without a delayed animation when reduced motion is requested", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    const close = vi.fn(); render(<Detail onClose={close} />);
    fireEvent.click(screen.getByText("Close detail")); expect(close).toHaveBeenCalledTimes(1);
  });
});


it("restores the source row after the phone sheet restores its background", () => {
  source.tabIndex = -1;
  const checkbox = document.createElement("button"); source.append(checkbox);
  const { unmount } = render(<Detail asSheet />);
  unmount(); checkbox.focus();
  act(() => vi.advanceTimersByTime(20));
  expect(main.inert).toBe(false); expect(source).toHaveFocus();
  expect(main.scrollTop).toBe(167); expect(inner.scrollTop).toBe(92);
});
it("leaves focus on another control chosen while the sheet is closing", () => {
  source.tabIndex = -1;
  const next = document.createElement("input"); main.append(next);
  const { unmount } = render(<Detail asSheet />);
  unmount(); next.focus();
  act(() => vi.advanceTimersByTime(20)); expect(next).toHaveFocus();
});
