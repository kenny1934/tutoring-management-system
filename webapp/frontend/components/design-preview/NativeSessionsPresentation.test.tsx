import { render, fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { NativeSessionResults, NativeSessionsViewSwitcher } from "./NativeSessionsPresentation";

const animate = vi.fn((frames: Keyframe[], options: KeyframeAnimationOptions) => ({ frames, options, cancel: vi.fn() }));
beforeEach(() => {
  window.sessionStorage.clear(); window.history.replaceState({}, "", "/sessions?ui-preview=motion");
  animate.mockClear(); Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
});
it("moves newly available dates in order, fades filter changes and cancels interrupted movement", () => {
  const props = { date: "2026-10-16", filterKey: "", ready: true, children: <button>Student</button> };
  const { rerender } = render(<NativeSessionResults {...props} />);
  expect(animate).not.toHaveBeenCalled();
  rerender(<NativeSessionResults {...props} date="2026-10-17" ready={false} />); expect(animate).not.toHaveBeenCalled();
  rerender(<NativeSessionResults {...props} date="2026-10-17" />);
  expect(animate.mock.calls[0][0][0].transform).toBe("translateX(12px)");
  const animation = animate.mock.results[0].value;
  rerender(<NativeSessionResults {...props} date="2026-10-15" />);
  expect(animation.cancel).toHaveBeenCalled(); expect(animate.mock.calls[1][0][0].transform).toBe("translateX(-12px)");
  rerender(<NativeSessionResults {...props} date="2026-10-15" filterKey="4" />);
  expect(animate.mock.calls[2][0][0].transform).toBe("translateX(0px)");
});
it("does not move keyboard focus, an inert page, reduced motion ", () => {
  const props = { date: "2026-10-16", filterKey: "", ready: true, children: <button>Student</button> };
  const { rerender, container } = render(<NativeSessionResults {...props} />);
  screen.getByRole("button").focus(); rerender(<NativeSessionResults {...props} date="2026-10-17" />);
  expect(animate).not.toHaveBeenCalled(); screen.getByRole("button").blur();
  container.setAttribute("inert", ""); rerender(<NativeSessionResults {...props} date="2026-10-18" />); expect(animate).not.toHaveBeenCalled(); container.removeAttribute("inert");
  const media = window.matchMedia; window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  rerender(<NativeSessionResults {...props} date="2026-10-19" />); expect(animate).not.toHaveBeenCalled(); window.matchMedia = media;
});
it("keeps every view available through the phone picker and reflects its current choice", () => {
  const onViewChange = vi.fn(); const { rerender } = render(<NativeSessionsViewSwitcher currentView="list" onViewChange={onViewChange} />);
  const picker = screen.getByRole("combobox", { name: "Sessions view" });
  expect(picker.querySelectorAll("option")).toHaveLength(4);
  fireEvent.change(picker, { target: { value: "weekly" } }); expect(onViewChange).toHaveBeenCalledWith("weekly");
  rerender(<NativeSessionsViewSwitcher currentView="weekly" onViewChange={onViewChange} />); expect(picker).toHaveValue("weekly");
});
