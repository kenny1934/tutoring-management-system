import { afterEach, describe, expect, it, vi } from "vitest";
import { attachDashboardDepth } from "./dashboardDepth";

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });
function scene() {
  document.body.innerHTML = '<main><div id="root"><div data-native-layer="welcome"></div><div data-native-depth-section><div data-native-depth-surface></div></div></div></main>';
  const main = document.querySelector("main")!;
  const root = document.getElementById("root")!;
  const welcome = root.firstElementChild!;
  let offset = 0;
  const rect = (top: number, height: number) => ({ x: 0, y: top, top, bottom: top + height, left: 0, right: 500, width: 500, height, toJSON: () => ({}) });
  vi.spyOn(main, "getBoundingClientRect").mockImplementation(() => rect(0, 800));
  vi.spyOn(welcome, "getBoundingClientRect").mockImplementation(() => rect(-offset, 200));
  vi.spyOn(root.lastElementChild!, "getBoundingClientRect").mockImplementation(() => rect(600 - offset, 300));
  vi.spyOn(root.querySelector('[data-native-depth-surface]')!, "getBoundingClientRect").mockImplementation(() => rect(600 - offset, 300));
  let frame: FrameRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { frame = callback; return 1; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  return { main, root, scroll(to: number) { offset = to; main.scrollTop = to; main.dispatchEvent(new Event("scroll")); frame?.(0); } };
}
describe("dashboard surface depth", () => {
  it("updates light on scroll without moving content or restoring the reader's position", () => {
    const { root, main, scroll } = scene();
    root.style.setProperty("--native-header-light", "0.8");
    const stop = attachDashboardDepth(root, main);
    expect(root.style.getPropertyValue("--native-header-light")).toBe("1.000");
    scroll(300);
    expect(root.style.getPropertyValue("--native-header-light")).toBe("0.000");
    expect(root.querySelector<HTMLElement>('[data-native-depth-surface]')!.style.getPropertyValue("--native-elevation")).not.toBe("0.000");
    expect(root.style.transform).toBe("");
    stop();
    expect(main.scrollTop).toBe(300);
    expect(root.style.getPropertyValue("--native-header-light")).toBe("0.8");
    expect(root.querySelector<HTMLElement>('[data-native-depth-surface]')!.style.getPropertyValue("--native-elevation")).toBe("");
  });
  it("keeps the light fixed under reduced motion and ignores queued work after cleanup", () => {
    const { root, main, scroll } = scene();
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList);
    const stop = attachDashboardDepth(root, main);
    scroll(300);
    expect(root.style.getPropertyValue("--native-header-light")).toBe("1.000");
    stop();
    scroll(500);
    expect(root.style.getPropertyValue("--native-header-light")).toBe("");
  });
});
