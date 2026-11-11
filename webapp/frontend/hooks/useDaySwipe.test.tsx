import { fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDaySwipe } from "./useDaySwipe";

const { trigger } = vi.hoisted(() => ({ trigger: vi.fn() }));
vi.mock("@/lib/useHaptic", () => ({ useHaptic: () => ({ trigger }) }));
const previous = vi.fn(), next = vi.fn();
function Example({ enabled = true, onNext = next }: { enabled?: boolean; onNext?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const arrow = useDaySwipe(ref, { enabled, onPrevious: previous, onNext });
  return <div ref={ref} data-testid="list"><div data-testid="nested" style={{ overflowX: "auto" }} />{arrow}</div>;
}
const point = (x: number, y = 100) => ({ clientX: x, clientY: y });
function start(el: HTMLElement, x = 180) { fireEvent.touchStart(el, { touches: [point(x)] }); }
function move(el: HTMLElement, x: number, y = 100) { fireEvent.touchMove(el, { touches: [point(x, y)] }); }
function end(el: HTMLElement) { fireEvent.touchEnd(el, { touches: [] }); }
beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: query === "(pointer: coarse)" }));
});

describe("day swipe", () => {
  it("keeps the 72px threshold, direction and selection haptic", () => {
    const { getByTestId } = render(<Example />); const el = getByTestId("list");
    start(el); move(el, 109); end(el); expect(next).not.toHaveBeenCalled();
    start(el); move(el, 108); move(el, 95); end(el);
    expect(next).toHaveBeenCalledTimes(1); expect(trigger).toHaveBeenCalledTimes(1);
    start(el); move(el, 252); end(el); expect(previous).toHaveBeenCalledTimes(1);
  });
  it("never commits a cancelled or multitouch gesture, even after it is armed", () => {
    const { getByTestId, container } = render(<Example />); const el = getByTestId("list");
    start(el); move(el, 80); fireEvent.touchCancel(el); end(el);
    expect(next).not.toHaveBeenCalled(); expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    start(el); move(el, 80); fireEvent.touchMove(el, { touches: [point(70), point(150)] }); end(el);
    expect(next).not.toHaveBeenCalled();
    start(el); move(el, 80); fireEvent.touchStart(el, { touches: [point(70), point(150)] }); end(el);
    expect(next).not.toHaveBeenCalled();
    start(el); move(el, 80); end(el); expect(next).toHaveBeenCalledTimes(1);
  });
  it("allows vertical scrolling and honours a horizontal scroller inside the list", () => {
    const { getByTestId } = render(<Example />); const el = getByTestId("list"), nested = getByTestId("nested");
    start(el); move(el, 177, 125); move(el, 80, 130); end(el); expect(next).not.toHaveBeenCalled();
    Object.defineProperties(nested, { scrollWidth: { value: 400 }, clientWidth: { value: 100 } });
    start(nested); move(nested, 80); end(nested); expect(next).not.toHaveBeenCalled();
  });
  it("disarms when the finger returns inside the threshold and uses the latest callbacks", () => {
    const { getByTestId, rerender } = render(<Example />); const el = getByTestId("list");
    start(el); move(el, 80); move(el, 150); end(el); expect(next).not.toHaveBeenCalled();
    const updated = vi.fn(); rerender(<Example onNext={updated} />);
    start(el); move(el, 80); end(el); expect(updated).toHaveBeenCalledTimes(1);
    rerender(<Example enabled={false} />); start(el); move(el, 80); end(el); expect(updated).toHaveBeenCalledTimes(1);
  });
});
