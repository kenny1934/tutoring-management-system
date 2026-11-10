import { act, fireEvent, render, screen } from "@testing-library/react";
import { useCallback, useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useThreadReadingPosition } from "./useThreadReadingPosition";

let height = 1000, shift = 0;
let observers: { callback: () => void; connected: boolean }[];
function Pane({ scope, ready = true, targetId }: { scope: string; ready?: boolean; targetId?: number }) {
  const scroller = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const attach = useCallback((element: HTMLDivElement | null) => {
    scroller.current = element; if (!element) return; let top = 0;
    Object.defineProperties(element, { scrollHeight: { configurable: true, get: () => height }, clientHeight: { configurable: true, get: () => 200 },
      scrollTop: { configurable: true, get: () => top, set: value => { top = Math.max(0, Math.min(value, height - 200)); } } });
  }, []);
  useThreadReadingPosition({ scroller, content, scope, ready, animate: false, targetId });
  return <div ref={attach} data-testid="reader"><div ref={content}>
    {[0, 1, 2, 3, 4].map(n => <div key={n} id={`msg-${n}`} data-top={n * 200}>Message {n}</div>)}
  </div></div>;
}
const resize = () => act(() => observers.filter(o => o.connected).forEach(o => o.callback()));
beforeEach(() => {
  height = 1000; shift = 0; observers = [];
  vi.stubGlobal("ResizeObserver", class { state: { callback: () => void; connected: boolean }; constructor(callback: () => void) { this.state = { callback, connected: true }; observers.push(this.state); } observe() {} disconnect() { this.state.connected = false; } });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const reader = this.closest<HTMLElement>('[data-testid="reader"]');
    const top = this.dataset.top === undefined ? 0 : Number(this.dataset.top) + shift - (reader?.scrollTop ?? 0);
    return new DOMRect(0, top, 400, this.dataset.top === undefined ? 200 : 200);
  });
});

describe("Inbox reading position", () => {
  it("lands within the conversation scroller on the notification message and remembers the place", () => {
    const first = render(<Pane scope="notification-target" targetId={2} />); const reader = screen.getByTestId("reader");
    expect(reader.scrollTop).toBe(300);
    expect(document.getElementById("msg-2")?.style.outline).toContain("2px solid");
    first.unmount(); render(<Pane scope="notification-target" />); expect(screen.getByTestId("reader").scrollTop).toBe(300);
  });
  it("opens new conversations at the latest messages and follows late content until the reader takes over", () => {
    render(<Pane scope="fresh" />); const reader = screen.getByTestId("reader");
    expect(reader.scrollTop).toBe(800); height = 1200; resize(); expect(reader.scrollTop).toBe(1000);
    fireEvent.wheel(reader); reader.scrollTop = 300; fireEvent.scroll(reader);
    height = 1400; resize(); expect(reader.scrollTop).toBe(300);
  });
  it("returns to the same message after close, including content growing above it", () => {
    const first = render(<Pane scope="remember-anchor" />); let reader = screen.getByTestId("reader");
    fireEvent.wheel(reader); reader.scrollTop = 340; fireEvent.scroll(reader); first.unmount();
    shift = 60; height = 1060; render(<Pane scope="remember-anchor" />); reader = screen.getByTestId("reader");
    expect(reader.scrollTop).toBe(400);
    shift = 100; height = 1100; resize(); expect(reader.scrollTop).toBe(440);
  });
  it("waits for full replies before restoring and keeps tutor reading places separate", () => {
    const first = render(<Pane scope="tutor-5:thread-12" />); let reader = screen.getByTestId("reader");
    fireEvent.touchStart(reader); reader.scrollTop = 260; fireEvent.scroll(reader); first.unmount();
    const second = render(<Pane scope="tutor-5:thread-12" ready={false} />); reader = screen.getByTestId("reader");
    expect(reader.scrollTop).toBe(0); second.rerender(<Pane scope="tutor-5:thread-12" ready />); expect(reader.scrollTop).toBe(260); second.unmount();
    render(<Pane scope="tutor-9:thread-12" />); expect(screen.getByTestId("reader").scrollTop).toBe(800);
  });
  it("stops restoration on keyboard navigation and remembers the resulting position", () => {
    const first = render(<Pane scope="keyboard" />); const reader = screen.getByTestId("reader");
    fireEvent.keyDown(reader, { key: "PageUp" }); reader.scrollTop = 180; fireEvent.scroll(reader); height = 1300; resize(); expect(reader.scrollTop).toBe(180); first.unmount();
    render(<Pane scope="keyboard" />); expect(screen.getByTestId("reader").scrollTop).toBe(180);
  });
});
