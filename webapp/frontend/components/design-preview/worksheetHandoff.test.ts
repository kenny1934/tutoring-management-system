import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { announceWorksheetReady, attachWorksheetHandoff } from "./worksheetHandoff";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { document.body.innerHTML = ""; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function scene() {
  document.body.innerHTML = `<main><div data-stage><div data-native-worksheet-pane data-native-worksheet-kind="pdf">
    <div data-native-pdf-scroll><div data-native-pdf-pages>
      <svg><defs><clipPath id="ink-clip"><rect width="20" height="20" /></clipPath></defs><path id="ink" clip-path="url(#ink-clip)" d="M1 1L2 2" /></svg>
      <button>Ink action</button>
    </div></div>
  </div></div></main>`;
  const root = document.querySelector<HTMLElement>("[data-stage]")!;
  const pane = root.querySelector<HTMLElement>("[data-native-worksheet-pane]")!;
  const viewport = pane.querySelector<HTMLElement>("[data-native-pdf-scroll]")!;
  const pages = viewport.firstElementChild as HTMLElement;
  vi.spyOn(pane, "getBoundingClientRect").mockReturnValue({ left: 300, top: 100, right: 1000, bottom: 800, width: 700, height: 700 } as DOMRect);
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({ left: 300, top: 140, right: 1000, bottom: 760, width: 700, height: 620 } as DOMRect);
  viewport.scrollTop = 470; viewport.scrollLeft = 65;
  const controller = attachWorksheetHandoff(root, { hold: "held", status: "status" });
  const ready = (key: number) => pages.dispatchEvent(new CustomEvent("csm-worksheet-ready", { bubbles: true, cancelable: true, detail: { key } }));
  const held = () => root.querySelector<HTMLElement>("[data-native-worksheet-hold]");
  return { root, pane, viewport, pages, controller, ready, held };
}

describe("wide-lesson worksheet continuity", () => {
  it("freezes the visible sheet and its ink at the same position, without duplicating live controls or SVG ids", () => {
    const s = scene();
    const write = vi.fn(); s.pages.querySelector("button")!.addEventListener("click", write);
    s.controller.prepare(2);
    const hold = s.held()!;
    expect(hold.inert).toBe(true);
    expect(hold).toHaveAttribute("aria-hidden", "true");
    expect(s.pane.inert).toBe(true);
    expect(hold.scrollTop).toBe(470); expect(hold.scrollLeft).toBe(65);
    expect(s.viewport.scrollTop).toBe(470);
    expect(hold.querySelector("clipPath")!.id).not.toBe("ink-clip");
    expect(hold.querySelector("path")!.getAttribute("clip-path")).toBe(`url(#${hold.querySelector("clipPath")!.id})`);
    hold.querySelector("button")!.click(); expect(write).not.toHaveBeenCalled();
    s.pages.querySelector("path")!.setAttribute("d", "M10 10L20 20");
    expect(hold.querySelector("path")!.getAttribute("d")).toBe("M1 1L2 2");
    expect(s.ready(2)).toBe(false);
    expect(s.held()).toBeNull(); expect(s.pane.inert).not.toBe(true);
    s.controller.dispose();
  });

  it("waits for decoded incoming pages and the restored layout before enabling their viewer", async () => {
    const s = scene(); s.controller.prepare(2);
    let decode!: () => void;
    const image = document.createElement("img");
    image.decode = vi.fn(() => new Promise<void>(resolve => { decode = resolve; }));
    s.pages.append(image);
    const stop = announceWorksheetReady(s.pages, 2);
    await vi.advanceTimersByTimeAsync(50); expect(s.held()).not.toBeNull();
    decode(); await vi.advanceTimersByTimeAsync(32);
    expect(s.held()).toBeNull(); expect(s.pane.inert).not.toBe(true);
    expect(s.viewport.scrollTop).toBe(470);
    stop(); s.controller.dispose();
  });

  it("keeps the last requested student when earlier files finish out of order", () => {
    const s = scene(); s.controller.prepare(2); const first = s.held();
    s.controller.prepare(3);
    expect(s.held()).toBe(first);
    expect(s.ready(2)).toBe(true); expect(s.held()).not.toBeNull();
    expect(s.ready(3)).toBe(false); expect(s.held()).toBeNull();
    s.controller.dispose();
  });

  it.each(["network", "render", "draft", "link"])("reveals the actual %s state without leaving a frozen sheet over it", async kind => {
    const s = scene(); s.controller.prepare(2);
    if (kind === "network") s.pane.dataset.nativeWorksheetError = "2";
    else if (kind === "render") { const error = document.createElement("div"); error.dataset.nativePdfFailed = ""; s.pane.append(error); }
    else s.pane.dataset.nativeWorksheetKind = kind;
    await Promise.resolve();
    expect(s.held()).toBeNull(); expect(s.pane.inert).not.toBe(true);
    s.controller.dispose();
  });

  it("preserves an existing inert/busy state and releases all resources on resize, timeout or unmount", async () => {
    const s = scene(); s.pane.inert = true; s.pane.setAttribute("aria-busy", "false");
    s.controller.prepare(2); window.dispatchEvent(new Event("resize"));
    expect(s.held()).toBeNull(); expect(s.pane.inert).toBe(true); expect(s.pane).toHaveAttribute("aria-busy", "false");
    s.controller.prepare(3); await vi.advanceTimersByTimeAsync(12001);
    expect(s.held()).toBeNull(); expect(s.root.querySelector('[role="status"]')).toBeNull();
    s.controller.prepare(4); s.controller.dispose();
    expect(s.held()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
    s.controller.prepare(5); expect(s.held()).toBeNull();
  });

  it("keeps the incoming viewer inert until the short fade ends, and skips that fade under reduced motion", async () => {
    const s = scene(); s.controller.prepare(2);
    const layer = s.root.querySelector<HTMLElement>("[data-native-worksheet-snapshot]")!;
    let finish!: () => void;
    const cancel = vi.fn();
    layer.animate = vi.fn(() => ({ cancel, finished: new Promise<void>(resolve => { finish = resolve; }) }) as unknown as Animation);
    s.ready(2); expect(s.pane.inert).toBe(true);
    finish(); await Promise.resolve(); expect(s.held()).toBeNull(); expect(s.pane.inert).not.toBe(true);
    s.controller.prepare(3);
    const next = s.root.querySelector<HTMLElement>("[data-native-worksheet-snapshot]")!; next.animate = vi.fn();
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    s.ready(3); expect(next.animate).not.toHaveBeenCalled(); expect(s.held()).toBeNull();
    s.controller.dispose();
  });

  it("does not announce stale pages or retain a snapshot when there was no worksheet", async () => {
    const s = scene(); const receive = vi.fn(); s.root.addEventListener("csm-worksheet-ready", receive);
    const stop = announceWorksheetReady(s.pages, 1); stop(); await vi.advanceTimersByTimeAsync(32);
    expect(receive).not.toHaveBeenCalled();
    s.viewport.remove(); s.controller.prepare(2); expect(s.held()).toBeNull();
    s.controller.dispose();
  });

  it("shows progress for a slow file without flashing it on cached switches", async () => {
    const s = scene(); s.controller.prepare(2);
    await vi.advanceTimersByTimeAsync(50); s.ready(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(s.root.querySelector('[role="status"]')).toBeNull();
    s.controller.prepare(3); await vi.advanceTimersByTimeAsync(181);
    expect(s.root.querySelector('[role="status"]')).toHaveTextContent("Loading worksheet...");
    s.ready(3); expect(s.root.querySelector('[role="status"]')).toBeNull();
    s.controller.dispose();
  });
});
