import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePanelSwipe } from "./usePanelSwipe";
function Panel({ close, managed = true, reduced = false }: { close: () => void; managed?: boolean; reduced?: boolean }) {
  const { panelRef, touchHandlers } = usePanelSwipe(true, close, { managedExit: managed, reducedMotion: reduced });
  return <div ref={panelRef} {...touchHandlers} data-testid="panel" />;
}
function swipe(x: number, y = 0) { const el = screen.getByTestId("panel");
  fireEvent.touchStart(el, { touches: [{ clientX: 0, clientY: 100 }] });
  fireEvent.touchMove(el, { touches: [{ clientX: x, clientY: 100 + y }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: x, clientY: 100 + y }] }); return el; }
afterEach(() => vi.useRealTimers());
describe("Inbox edge swipe", () => {
  it("accepts a gesture starting at x=0 and lets the frame own the committed exit", () => {
    const close = vi.fn(); render(<Panel close={close} />); const el = swipe(160);
    expect(close).toHaveBeenCalledTimes(1); expect(el.style.transform).toBe("translateX(160px)");
  });
  it("leaves vertical scrolling and cancelled gestures in the current conversation", () => {
    const close = vi.fn(); render(<Panel close={close} />); swipe(30, 100); expect(close).not.toHaveBeenCalled();
    const el = screen.getByTestId("panel"); fireEvent.touchStart(el, { touches: [{ clientX: 12, clientY: 100 }] });
    fireEvent.touchMove(el, { touches: [{ clientX: 90, clientY: 100 }] }); fireEvent.touchCancel(el);
    expect(el.style.transform).toBe("translateX(0)"); expect(close).not.toHaveBeenCalled();
  });
  it("does not call a previous conversation's delayed close after unmount", () => {
    vi.useFakeTimers(); const close = vi.fn(); const view = render(<Panel close={close} managed={false} />);
    swipe(160); view.unmount(); vi.runAllTimers(); expect(close).not.toHaveBeenCalled();
  });
  it("closes immediately with reduced motion even without a managed frame", () => {
    const close = vi.fn(); render(<Panel close={close} managed={false} reduced />); swipe(160);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
