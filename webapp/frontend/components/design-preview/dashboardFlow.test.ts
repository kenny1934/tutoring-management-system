import { afterEach, describe, expect, it, vi } from "vitest";
import { attachDashboardFlow } from "./dashboardFlow";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });
function scene(reduce = false) {
  document.body.innerHTML = '<main><div id="root"><section id="first" data-native-flow-enter>Today</section><section id="lower" data-native-flow-enter>Existing chart</section></div></main>';
  const main = document.querySelector("main")!, root = document.getElementById("root")!;
  const first = document.getElementById("first")!, lower = document.getElementById("lower")!;
  const rect = (top: number) => ({ top, bottom: top + 600 } as DOMRect);
  vi.spyOn(main, "getBoundingClientRect").mockReturnValue(rect(0));
  vi.spyOn(first, "getBoundingClientRect").mockReturnValue(rect(100));
  vi.spyOn(lower, "getBoundingClientRect").mockReturnValue(rect(900));
  let enter!: IntersectionObserverCallback;
  const observe = vi.fn(), unobserve = vi.fn(), disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", class { constructor(callback: IntersectionObserverCallback) { enter = callback; } observe = observe; unobserve = unobserve; disconnect = disconnect; });
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel, finished: new Promise(() => {}) } as unknown as Animation));
  Object.assign(lower, { animate });
  const media = { matches: reduce, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.spyOn(window, "matchMedia").mockReturnValue(media as unknown as MediaQueryList);
  return { main, root, first, lower, observe, animate, cancel, media, enter() { enter([{ target: lower, isIntersecting: true, boundingClientRect: rect(900), intersectionRatio: 1, intersectionRect: rect(900), rootBounds: rect(0), time: 0 }], {} as IntersectionObserver); } };
}

describe("dashboard section arrival", () => {
  it("keeps the first screen steady and content readable, and animates a lower section only once", () => {
    const s = scene(); const stop = attachDashboardFlow(s.root, s.main);
    expect(s.observe).toHaveBeenCalledWith(s.lower);
    expect(s.observe).not.toHaveBeenCalledWith(s.first);
    expect(s.lower.style.opacity).toBe("");
    s.enter(); s.enter();
    expect(s.animate).toHaveBeenCalledTimes(1);
    expect(s.lower.textContent).toBe("Existing chart");
    s.main.scrollTop = 400; stop();
    expect(s.cancel).toHaveBeenCalledOnce();
    expect(s.main.scrollTop).toBe(400);
    expect(s.lower.style.transform).toBe("");
    s.enter(); expect(s.animate).toHaveBeenCalledTimes(1);
  });

  it("leaves sections still under reduced motion or while a phone overlay is open", () => {
    const reduced = scene(true); const stop = attachDashboardFlow(reduced.root, reduced.main);
    reduced.enter(); expect(reduced.animate).not.toHaveBeenCalled(); stop();
    const overlay = scene(); overlay.main.inert = true;
    const end = attachDashboardFlow(overlay.root, overlay.main); overlay.enter();
    expect(overlay.animate).not.toHaveBeenCalled(); end();
  });

  it("does not move a section that contains the current keyboard focus", () => {
    const s = scene(); const button = document.createElement("button"); s.lower.append(button); button.focus();
    const stop = attachDashboardFlow(s.root, s.main); s.enter();
    expect(s.animate).not.toHaveBeenCalled(); stop();
  });

  it("keeps already-read sections still after a real route remount", () => {
    const read = new Set<string>();
    const first = scene(); const leave = attachDashboardFlow(first.root, first.main, read);
    first.enter(); expect(first.animate).toHaveBeenCalledOnce(); leave();
    const returned = scene(); const stop = attachDashboardFlow(returned.root, returned.main, read);
    expect(returned.observe).not.toHaveBeenCalledWith(returned.lower);
    returned.enter(); expect(returned.animate).not.toHaveBeenCalled(); stop();
    const newViewer = scene(); const finish = attachDashboardFlow(newViewer.root, newViewer.main, new Set());
    newViewer.enter(); expect(newViewer.animate).toHaveBeenCalledOnce(); finish();
  });
});
