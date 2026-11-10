import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeChartPlot } from "./NativeChartLegend";

afterEach(() => vi.restoreAllMocks());
describe("chart plot changes", () => {
  it("fades updates without remounting, and cancels an interrupted transition", () => {
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }) as unknown as Animation);
    const view = render(<NativeChartPlot enabled signature="donut"><button>Chart</button></NativeChartPlot>);
    const plot = view.container.firstElementChild as HTMLElement;
    plot.animate = animate;
    const button = plot.querySelector("button")!;
    button.focus();
    view.rerender(<NativeChartPlot enabled signature="bar"><button>Chart</button></NativeChartPlot>);
    expect(animate).toHaveBeenCalledWith([{ opacity: .55 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
    expect(plot.querySelector("button")).toBe(button);
    expect(button).toHaveFocus();
    view.rerender(<NativeChartPlot enabled signature="radial"><button>Chart</button></NativeChartPlot>);
    expect(cancel).toHaveBeenCalledOnce();
    view.unmount();
    expect(cancel).toHaveBeenCalledTimes(2);
  });
  it.each([true, false])("skips movement with reduced motion or outside Motion (reduced: %s)", reduced => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: reduced } as MediaQueryList);
    const view = render(<NativeChartPlot enabled={reduced} signature="A">Chart</NativeChartPlot>);
    const plot = view.container.firstElementChild as HTMLElement;
    plot.animate = vi.fn();
    view.rerender(<NativeChartPlot enabled={reduced} signature="B">Chart</NativeChartPlot>);
    expect(plot.animate).not.toHaveBeenCalled();
  });
});
