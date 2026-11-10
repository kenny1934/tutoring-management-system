import { useRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCalendarMotion } from "./useCalendarMotion";

let reduced = false, width = 280, resize: () => void;
const animation = () => ({ cancel: vi.fn() });
function Month({ month = 0, date = "A" }: { month?: number; date?: string | null }) {
  const root = useRef<HTMLDivElement>(null);
  useCalendarMotion(root, true, month, date);
  return <div ref={root}>
    <div data-calendar-month-page><div data-calendar-days>
      <div data-calendar-selection hidden />
      <button role="gridcell" data-calendar-day="A" aria-selected={date === "A"} />
      <button role="gridcell" data-calendar-day="B" aria-selected={date === "B"} />
    </div></div>
    <div data-calendar-agenda />
  </div>;
}
beforeEach(() => {
  reduced = false; width = 280;
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({ matches: reduced, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList));
  vi.stubGlobal("ResizeObserver", class { constructor(fn: () => void) { resize = fn; } observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) { return this.hasAttribute("data-calendar-days") ? width : 40; });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(40);
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) { return this.dataset.calendarDay === "B" ? 42 : 0; });
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockReturnValue(0);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("calendar local motion", () => {
  it("moves the selection without cancelling it on the observer's first notification", () => {
    const moved = animation(), fade = animation();
    const scene = render(<Month />);
    const indicator = scene.container.querySelector<HTMLElement>("[data-calendar-selection]")!;
    const agenda = scene.container.querySelector<HTMLElement>("[data-calendar-agenda]")!;
    indicator.animate = vi.fn(() => moved as unknown as Animation); agenda.animate = vi.fn(() => fade as unknown as Animation);
    agenda.scrollTop = 100;
    scene.rerender(<Month date="B" />);
    expect(indicator.style.transform).toBe("translate(42px, 0px)");
    expect(indicator.animate).toHaveBeenCalledOnce(); expect(agenda.scrollTop).toBe(0);
    act(() => resize()); expect(moved.cancel).not.toHaveBeenCalled();
    width = 350; act(() => resize()); expect(moved.cancel).toHaveBeenCalled();
    scene.unmount(); expect(fade.cancel).toHaveBeenCalled();
  });
  it("uses the month direction and clears a deselected indicator", () => {
    const scene = render(<Month />);
    const page = scene.container.querySelector<HTMLElement>("[data-calendar-month-page]")!;
    page.animate = vi.fn(() => animation() as unknown as Animation);
    scene.rerender(<Month month={1} date={null} />);
    expect(page.animate).toHaveBeenLastCalledWith([{ opacity: .6, translate: "12px 0" }, { opacity: 1, translate: "0 0" }], expect.anything());
    expect(scene.container.querySelector("[data-calendar-selection]")).toHaveAttribute("hidden");
    scene.rerender(<Month month={0} date={null} />);
    expect(page.animate).toHaveBeenLastCalledWith([{ opacity: .6, translate: "-12px 0" }, { opacity: 1, translate: "0 0" }], expect.anything());
  });
  it("still resets a newly selected agenda when reduced motion removes the animation", () => {
    reduced = true;
    const scene = render(<Month />);
    const agenda = scene.container.querySelector<HTMLElement>("[data-calendar-agenda]")!;
    agenda.animate = vi.fn(); agenda.scrollTop = 80;
    scene.rerender(<Month date="B" />);
    expect(agenda.scrollTop).toBe(0); expect(agenda.animate).not.toHaveBeenCalled();
  });
});
