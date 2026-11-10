import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMaterialFlight, rememberScroll, restoreScroll } from "./materialJourney";
import { useDocumentJourney } from "./useDocumentJourney";
import { useFolderJourney } from "./useFolderJourney";

const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
let animations: { cancel: ReturnType<typeof vi.fn>; finish: () => void }[];
function box(element: HTMLElement, left = 20, top = 30, width = 220, height = 180) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} });
  return element;
}
function scene() {
  const root = document.createElement("div"), scroller = document.createElement("div"), source = document.createElement("div"), reader = document.createElement("div");
  scroller.style.overflowY = "auto"; source.dataset.materialDocId = "1"; source.innerHTML = '<h3 id="worksheet-title">Worksheet</h3><button>Open worksheet</button>';
  reader.dataset.materialReaderContent = "1"; reader.style.opacity = ".8";
  root.append(scroller, reader); scroller.append(source); document.body.append(root);
  box(source); box(reader, 500, 80, 300, 650); box(scroller, 0, 0, 440, 700);
  return { root, scroller, source, reader };
}
beforeEach(() => {
  vi.useFakeTimers(); animations = [];
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: vi.fn(() => {
    let finish!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    const cancel = vi.fn(); animations.push({ cancel, finish }); return { finished, cancel };
  }) });
});
afterEach(() => {
  document.querySelectorAll<HTMLElement>('[data-material-flight]').forEach(() => window.dispatchEvent(new Event("resize")));
  document.body.innerHTML = ""; vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
  if (originalAnimate) Object.defineProperty(HTMLElement.prototype, "animate", originalAnimate); else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

describe("temporary material journeys", () => {
  it("leaves focus and source content untouched and removes the visual on a new action", () => {
    const { source, reader } = scene(); source.querySelector("button")!.focus();
    const flight = createMaterialFlight(source, { kind: "document" })!; flight.land(reader);
    const copy = document.querySelector<HTMLElement>('[data-material-flight]')!;
    expect(copy).toHaveAttribute("aria-hidden", "true"); expect(copy.inert).toBe(true);
    expect(copy.querySelector('[id]')).toBeNull(); expect(copy).not.toHaveAttribute("data-material-doc-id"); expect(source).toHaveAttribute("data-material-doc-id", "1"); expect(document.activeElement).toBe(source.querySelector("button"));
    expect(reader.inert).toBe(true);
    window.dispatchEvent(new Event("pointerdown"));
    expect(document.querySelector('[data-material-flight]')).toBeNull();
    expect(reader.style.opacity).toBe("0.8"); expect(reader.inert).not.toBe(true);
    expect(animations.every(animation => animation.cancel.mock.calls.length === 1)).toBe(true);
  });
  it("cleans up an unfinished arrival when resized or when its destination never arrives", () => {
    const { source, reader } = scene(); const finished = vi.fn();
    const first = createMaterialFlight(source, { kind: "document", onFinish: finished })!; first.land(reader);
    window.dispatchEvent(new Event("resize"));
    expect(finished).toHaveBeenCalledOnce(); expect(reader.style.opacity).toBe("0.8");
    createMaterialFlight(source, { kind: "folder" }); vi.advanceTimersByTime(700);
    expect(document.querySelector('[data-material-flight]')).toBeNull();
  });
  it("restores the actual reader after the travelling copy completes", async () => {
    const { source, reader } = scene(); const finished = vi.fn();
    createMaterialFlight(source, { kind: "document", onFinish: finished })!.land(reader);
    await act(async () => animations[0].finish());
    expect(reader.inert).not.toBe(true); expect(reader.style.opacity).toBe("0.8");
    expect(document.querySelector('[data-material-flight]')).toBeNull(); expect(finished).toHaveBeenCalledOnce();
  });
  it("creates no overlay for reduced motion or an invisible source", () => {
    const { source } = scene(); vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    expect(createMaterialFlight(source, { kind: "document" })).toBeNull();
    vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as MediaQueryList); box(source, 0, 0, 0, 0);
    expect(createMaterialFlight(source, { kind: "document" })).toBeNull();
    expect(document.querySelector('[data-material-flight]')).toBeNull();
  });
  it("restores each nested scroller without changing unrelated page state", () => {
    const { scroller, source } = scene(); scroller.scrollTop = 140; scroller.scrollLeft = 12;
    const saved = rememberScroll(source); scroller.scrollTop = 260; scroller.scrollLeft = 40; restoreScroll(saved);
    expect(scroller.scrollTop).toBe(140); expect(scroller.scrollLeft).toBe(12);
  });
});

describe("document reader return", () => {
  it("cancels transient copies and unmasks the reader on unmount", () => {
    const { root, source, reader } = scene();
    const ref = { current: root };
    const view = renderHook(({ id }) => useDocumentJourney(ref, id), { initialProps: { id: null as number | null } });
    act(() => view.result.current.prepareOpen(1, source)); view.rerender({ id: 1 });
    expect(reader.inert).toBe(true); view.unmount();
    expect(reader.inert).not.toBe(true); expect(root.dataset.materialJourney).toBeUndefined(); expect(document.querySelector('[data-material-flight]')).toBeNull();
  });
  it("returns scroll and focus to the actual source even with reduced motion", () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    const { root, source, scroller } = scene(); const ref = { current: root };
    const view = renderHook(({ id }) => useDocumentJourney(ref, id), { initialProps: { id: null as number | null } });
    scroller.scrollTop = 140; act(() => view.result.current.prepareOpen(1, source)); view.rerender({ id: 1 });
    scroller.scrollTop = 230; act(() => view.result.current.prepareReturn()); view.rerender({ id: null });
    act(() => vi.advanceTimersByTime(30)); expect(scroller.scrollTop).toBe(140); expect(source).toHaveFocus();
    expect(document.querySelector('[data-material-flight]')).toBeNull(); view.unmount();
  });
});

it("returns a folder to its previous scroll position and its newly rendered source", () => {
  vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
  const { scroller, source } = scene(); source.dataset.materialFile = "Root"; const ref = { current: scroller };
  const view = renderHook(({ path }) => useFolderJourney(ref, path, false, false), { initialProps: { path: [] as string[] } });
  scroller.scrollTop = 120; act(() => view.result.current.enter("Root", ["Root"])); view.rerender({ path: ["Root"] });
  source.remove(); const returned = document.createElement("div"); returned.dataset.materialFile = "Root"; scroller.append(returned); scroller.scrollTop = 0;
  act(() => view.result.current.back([])); view.rerender({ path: [] });
  expect(scroller.scrollTop).toBe(120); expect(returned).toHaveFocus(); expect(document.querySelector('[data-material-flight]')).toBeNull(); view.unmount();
});
