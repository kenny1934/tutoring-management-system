import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { lessonInkAPI, type LessonInkPage } from "@/lib/api";
import {
  useAnnotations, inkLayers, getStrokeOptions, hasInk, serverPageIndex, viewPageIndex, inkTargetKey, lessonDraftId, lessonOfDraft,
  roundStroke, type ReplacedInk, type Stroke,
} from "./useAnnotations";

vi.mock("@/lib/api", () => ({
  lessonInkAPI: { read: vi.fn(), save: vi.fn(), saveOnExit: vi.fn() },
}));

const EX = 1;

// Each stroke gets its own object, which is how the hook tells strokes apart.
function stroke(label: string): Stroke {
  return { points: [[0, 0, 0.5], [1, 1, 0.5]], color: label, size: 2 };
}

// Mimic the lesson viewers, which draw by appending one stroke to a page.
function draw(hook: ReturnType<typeof useAnnotations>, page: number, s: Stroke) {
  const strokes = hook.getAnnotations(EX)[page] || [];
  hook.setPageStrokes(EX, page, [...strokes, s]);
}

const colours = (strokes: Stroke[] | undefined) => (strokes || []).map((s) => s.color);

describe("useAnnotations undo and redo", () => {
  beforeEach(() => sessionStorage.clear());

  it("undoes one stroke at a time in the order they were drawn, across pages", () => {
    const { result } = renderHook(() => useAnnotations());
    const hook = result.current;
    draw(hook, 2, stroke("a"));
    draw(hook, 0, stroke("b"));
    draw(hook, 2, stroke("c"));

    expect(colours(hook.undo(EX)?.[2])).toEqual(["a"]);
    const afterSecond = hook.undo(EX);
    expect(colours(afterSecond?.[0])).toEqual([]);
    expect(colours(afterSecond?.[2])).toEqual(["a"]);
    expect(colours(hook.undo(EX)?.[2])).toEqual([]);
    expect(hook.undo(EX)).toBeNull();
  });

  it("redoes in the reverse order of the undos", () => {
    const { result } = renderHook(() => useAnnotations());
    const hook = result.current;
    draw(hook, 1, stroke("a"));
    draw(hook, 0, stroke("b"));
    hook.undo(EX);
    hook.undo(EX);

    expect(colours(hook.redo(EX)?.[1])).toEqual(["a"]);
    expect(colours(hook.redo(EX)?.[0])).toEqual(["b"]);
    expect(hook.redo(EX)).toBeNull();
  });

  it("treats erasing as a change, so undo brings the erased stroke back", () => {
    const { result } = renderHook(() => useAnnotations());
    const hook = result.current;
    const a = stroke("a");
    const b = stroke("b");
    draw(hook, 0, a);
    draw(hook, 0, b);
    hook.setPageStrokes(EX, 0, [b]);

    expect(colours(hook.undo(EX)?.[0])).toEqual(["a", "b"]);
  });

  it("ignores pages reported back unchanged, as the viewers report every page", () => {
    const { result } = renderHook(() => useAnnotations());
    const hook = result.current;
    draw(hook, 0, stroke("a"));
    draw(hook, 1, stroke("b"));
    // Page 0 comes back as the same strokes while page 1 is being drawn on.
    hook.setPageStrokes(EX, 0, [...hook.getAnnotations(EX)[0]]);

    const updated = hook.undo(EX);
    expect(colours(updated?.[1])).toEqual([]);
    expect(colours(updated?.[0])).toEqual(["a"]);
  });

  it("drops the redo history once something new is drawn", () => {
    const { result } = renderHook(() => useAnnotations());
    const hook = result.current;
    draw(hook, 0, stroke("a"));
    hook.undo(EX);
    draw(hook, 1, stroke("b"));

    expect(hook.redo(EX)).toBeNull();
  });

  it("limits undo and redo to one page when a page is given", () => {
    const { result } = renderHook(() => useAnnotations());
    const hook = result.current;
    draw(hook, 0, stroke("a"));
    draw(hook, 1, stroke("b"));

    const updated = hook.undo(EX, 0);
    expect(colours(updated?.[0])).toEqual([]);
    expect(colours(updated?.[1])).toEqual(["b"]);
    expect(hook.redo(EX, 1)).toBeNull();
    expect(colours(hook.redo(EX, 0)?.[0])).toEqual(["a"]);
  });

  it("lets you undo clearing a page", () => {
    const { result } = renderHook(() => useAnnotations());
    const hook = result.current;
    draw(hook, 0, stroke("a"));
    hook.clearPage(EX, 0);

    expect(hook.hasAnnotations(EX)).toBe(false);
    expect(colours(hook.undo(EX)?.[0])).toEqual(["a"]);
  });

  it("brings every page back with one undo after clearing the whole exercise, and redo clears it again", () => {
    const { result } = renderHook(() => useAnnotations());
    const hook = result.current;
    draw(hook, 0, stroke("a"));
    draw(hook, 2, stroke("b"));
    hook.clearAnnotations(EX);
    expect(hook.hasAnnotations(EX)).toBe(false);

    const restored = hook.undo(EX);
    expect(colours(restored?.[0])).toEqual(["a"]);
    expect(colours(restored?.[2])).toEqual(["b"]);

    const cleared = hook.redo(EX);
    expect(colours(cleared?.[0])).toEqual([]);
    expect(colours(cleared?.[2])).toEqual([]);
    // The step before the clear is still there underneath it.
    hook.undo(EX);
    expect(colours(hook.undo(EX)?.[2])).toEqual([]);
  });

  it("takes only one page's share of a whole-exercise clear when undoing on that page", () => {
    const { result } = renderHook(() => useAnnotations());
    const hook = result.current;
    draw(hook, 0, stroke("a"));
    draw(hook, 1, stroke("b"));
    hook.clearAnnotations(EX);

    const pageOne = hook.undo(EX, 1);
    expect(colours(pageOne?.[1])).toEqual(["b"]);
    expect(colours(pageOne?.[0])).toEqual([]);
    expect(colours(hook.undo(EX, 0)?.[0])).toEqual(["a"]);
  });

  it("clears only the pages it's given, as one change that one undo brings back", () => {
    const { result } = renderHook(() => useAnnotations());
    const hook = result.current;
    draw(hook, 0, stroke("a"));
    draw(hook, 1000, stroke("b"));
    draw(hook, 1001, stroke("c"));

    hook.clearAnnotations(EX, [1000, 1001]);
    expect(colours(hook.getAnnotations(EX)[0])).toEqual(["a"]);
    expect(colours(hook.getAnnotations(EX)[1000])).toEqual([]);

    const back = hook.undo(EX);
    expect(colours(back?.[1000])).toEqual(["b"]);
    expect(colours(back?.[1001])).toEqual(["c"]);
  });

  it("saves several pages as one change that one undo takes back, leaving out pages that haven't changed", () => {
    const { result } = renderHook(() => useAnnotations());
    const hook = result.current;
    const a = stroke("a");
    draw(hook, 0, a);
    draw(hook, 1, stroke("b"));

    // The stroke moves from page 0 to the Draft's first sheet, and page 1 comes back as it was.
    hook.setPagesStrokes(EX, { 0: [], 1: hook.getAnnotations(EX)[1], 1000: [a] });
    expect(colours(hook.getAnnotations(EX)[1000])).toEqual(["a"]);

    const back = hook.undo(EX);
    expect(colours(back?.[0])).toEqual(["a"]);
    expect(colours(back?.[1000])).toEqual([]);
    // Page 1 wasn't part of the move, so the next undo takes back its own stroke.
    expect(colours(hook.undo(EX)?.[1])).toEqual([]);
  });

  it("records nothing when clearing an exercise with no ink", () => {
    const { result } = renderHook(() => useAnnotations());
    const hook = result.current;
    hook.clearAnnotations(EX);
    expect(hook.undo(EX)).toBeNull();
  });

  it("keeps undo working on strokes restored after a reload, in page order", () => {
    const saved = { [EX]: { 0: [stroke("a")], 1: [stroke("b"), stroke("c")] } };
    sessionStorage.setItem("lesson-test", JSON.stringify(saved));
    const { result } = renderHook(() => useAnnotations("lesson-test"));
    const hook = result.current;

    expect(colours(hook.undo(EX)?.[1])).toEqual(["b"]);
    expect(colours(hook.undo(EX)?.[1])).toEqual([]);
    expect(colours(hook.undo(EX)?.[0])).toEqual([]);
    expect(hook.undo(EX)).toBeNull();
  });
});

describe("useAnnotations ink sources", () => {
  beforeEach(() => sessionStorage.clear());

  it("remembers what an exercise's ink is on across a reload", () => {
    const first = renderHook(() => useAnnotations<{ pdfName: string }>("lesson-test"));
    first.result.current.setInkSource(-7, { pdfName: "preview.pdf" });
    first.unmount();

    const reloaded = renderHook(() => useAnnotations<{ pdfName: string }>("lesson-test"));
    expect(reloaded.result.current.getInkSource(-7)).toEqual({ pdfName: "preview.pdf" });
    expect(reloaded.result.current.getInkSource(8)).toBeUndefined();
  });

  it("forgets them when the ink's storage is cleared", () => {
    const first = renderHook(() => useAnnotations<string>("lesson-test"));
    first.result.current.setInkSource(1, "a.pdf");
    first.result.current.clearStorage();
    first.unmount();

    const reloaded = renderHook(() => useAnnotations<string>("lesson-test"));
    expect(reloaded.result.current.getInkSource(1)).toBeUndefined();
  });
});

describe("getStrokeOptions", () => {
  it("draws a two-point stroke as an even line that reaches both of its ends, even mid-drag", () => {
    const line: Stroke = { points: [[0, 0, 0.2], [100, 0, 0.9]], color: "#000", size: 6 };
    const options = getStrokeOptions(line, false);
    expect(options.thinning).toBe(0);
    expect(options.streamline).toBe(0);
    expect(options.simulatePressure).toBe(false);
  });
});

describe("inkLayers", () => {
  it("puts every highlighter stroke in the layer under the pen strokes, keeping each layer's order", () => {
    const pen1 = stroke("red");
    const hl1: Stroke = { ...stroke("yellow"), kind: "highlighter" };
    const pen2 = stroke("blue");
    const hl2: Stroke = { ...stroke("pink"), kind: "highlighter" };
    expect(inkLayers([pen1, hl1, pen2, hl2])).toEqual([[hl1, hl2], [pen1, pen2]]);
  });
});

describe("hasInk", () => {
  it("is true only when some page holds a stroke", () => {
    expect(hasInk(undefined)).toBe(false);
    expect(hasInk({})).toBe(false);
    expect(hasInk({ 0: [], 1: [] })).toBe(false);
    expect(hasInk({ 0: [], 1: [stroke("red")] })).toBe(true);
  });
});

describe("server keys and rounding", () => {
  it("saves a worksheet page under its page of the PDF, and a Draft sheet under its own index", () => {
    expect(serverPageIndex(1, [5, 6, 7])).toBe(5);
    expect(serverPageIndex(3, [])).toBe(3);
    expect(serverPageIndex(1000, [5, 6, 7])).toBe(1000);
    expect(serverPageIndex(3, [5, 6, 7])).toBeNull();
  });

  it("finds a saved page among the pages shown, even after the range has moved", () => {
    expect(viewPageIndex(5, [5, 6, 7])).toBe(1);
    expect(viewPageIndex(5, [6, 7])).toBe(0);
    expect(viewPageIndex(8, [5, 6, 7])).toBeNull();
    expect(viewPageIndex(1002, [5])).toBe(1002);
  });

  it("keys a preview by its file", () => {
    expect(inkTargetKey(12)).toBe("ex:12");
    expect(inkTargetKey(-345)).toBe("preview:345");
  });

  it("keys a lesson's own Draft by its lesson, apart from every exercise and preview", () => {
    expect(inkTargetKey(lessonDraftId(100))).toBe("draft:100");
    expect(lessonOfDraft(lessonDraftId(100))).toBe(100);
    expect(lessonOfDraft(12)).toBeNull();
    // The largest file id the server allows is still a preview.
    expect(lessonOfDraft(-9_999_999_999)).toBeNull();
    expect(inkTargetKey(-9_999_999_999)).toBe("preview:9999999999");
  });

  it("rounds points for saving, and keeps a pressure of exactly 0.5", () => {
    const rounded = roundStroke({ points: [[1.234, 5.678, 0.5], [2.25, 3.96, 0.4567]], color: "red", size: 2 });
    expect(rounded.points).toEqual([[1.2, 5.7, 0.5], [2.3, 4, 0.46]]);
  });
});

describe("useAnnotations saving to the server", () => {
  const api = vi.mocked(lessonInkAPI);
  const KEY = "ink-test";

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    api.read.mockReset();
    api.save.mockReset();
    api.saveOnExit.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  const onServer = (strokes: Stroke[], over: Partial<LessonInkPage> = {}): LessonInkPage => ({
    session_id: 100, target_key: "ex:1", page_index: 0, pdf_page: 1, pdf_name: "A.pdf", strokes,
    version: 1, updated_by: "me@example.com", updated_by_name: "Me", updated_at: null, ...over,
  });
  const savedAs = (page_index: number, version: number) => ({
    saved: [{ session_id: 100, target_key: "ex:1", page_index, version }], dropped: [],
  });

  // Let pending promises settle, moving the clock on first if asked.
  const tick = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

  async function mount(pages: LessonInkPage[], pdfPages: number[] = [], onReplaced?: (p: ReplacedInk[]) => void) {
    api.read.mockResolvedValue({ pages });
    const view = renderHook(() => useAnnotations(KEY, {
      sessionIds: [100],
      locate: () => ({ sessionId: 100, pdfName: "A.pdf", pdfPages }),
      onReplaced,
    }));
    await tick();
    return view;
  }

  it("loads the lesson's ink, putting each page on its page of the PDF", async () => {
    const { result } = await mount([
      onServer([stroke("a")], { page_index: 5, pdf_page: 6 }),
      onServer([stroke("b")], { page_index: 8, pdf_page: 9 }),
    ], [5, 6, 7]);

    expect(api.read).toHaveBeenCalledWith([100]);
    expect(result.current.inkReady).toBe(true);
    expect(result.current.syncStatus).toBe("saved");
    // Page 9 isn't among the pages shown, so it's left alone on the server.
    expect(Object.keys(result.current.getAnnotations(EX))).toEqual(["1"]);
    expect(colours(result.current.getAnnotations(EX)[1])).toEqual(["a"]);
  });

  it("sends a changed page two seconds after the last change, under its page of the PDF, with rounded points", async () => {
    const { result } = await mount([], [5, 6, 7]);
    api.save.mockResolvedValue(savedAs(5, 1));
    act(() => result.current.setPageStrokes(EX, 1, [{ points: [[1.234, 5.678, 0.5]], color: "red", size: 2 }]));

    await tick(1999);
    expect(api.save).not.toHaveBeenCalled();
    await tick(1);
    await tick();
    expect(api.save).toHaveBeenCalledWith([{
      session_id: 100, target_key: "ex:1", page_index: 5, pdf_page: 6, pdf_name: "A.pdf",
      strokes: [{ points: [[1.2, 5.7, 0.5]], color: "red", size: 2 }],
    }]);
    expect(result.current.syncStatus).toBe("saved");
    expect(result.current.hasUnsentInk()).toBe(false);
  });

  it("keeps a page waiting when a send fails, and tries again", async () => {
    const { result } = await mount([]);
    api.save.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(savedAs(0, 1));
    act(() => draw(result.current, 0, stroke("a")));

    await tick(2000);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(result.current.syncStatus).toBe("waiting");
    expect(result.current.hasUnsentInk()).toBe(true);

    await tick(2000);
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(result.current.syncStatus).toBe("saved");
  });

  it("lets a page the tab hadn't sent win over the server's copy, then sends it", async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ [EX]: { 0: [stroke("mine")] } }));
    api.save.mockResolvedValue(savedAs(0, 4));
    const { result } = await mount([onServer([stroke("theirs")], { version: 3 })]);

    expect(colours(result.current.getAnnotations(EX)[0])).toEqual(["mine"]);
    await tick(2000);
    expect(colours(api.save.mock.calls[0][0][0].strokes)).toEqual(["mine"]);
  });

  it("sends nothing until the lesson's ink has loaded", async () => {
    let finishLoading: (value: { pages: LessonInkPage[] }) => void = () => {};
    api.read.mockReturnValue(new Promise((resolve) => { finishLoading = resolve; }));
    api.save.mockResolvedValue(savedAs(0, 1));
    sessionStorage.setItem(KEY, JSON.stringify({ [EX]: { 0: [stroke("mine")] } }));
    const { result } = renderHook(() => useAnnotations(KEY, {
      sessionIds: [100], locate: () => ({ sessionId: 100, pdfPages: [] }),
    }));

    await tick(5000);
    expect(api.save).not.toHaveBeenCalled();
    expect(result.current.inkReady).toBe(false);

    await act(async () => finishLoading({ pages: [] }));
    await tick(2000);
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it("takes a page someone else changed when the tab comes back into view, and says so", async () => {
    const onReplaced = vi.fn();
    const { result } = await mount([onServer([stroke("a")])], [], onReplaced);
    act(() => draw(result.current, 1, stroke("mine")));

    api.read.mockResolvedValue({ pages: [
      onServer([stroke("b")], { version: 2, updated_by_name: "Ms Other" }),
      onServer([stroke("x")], { page_index: 1, pdf_page: 2, version: 5 }),
    ] });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(colours(result.current.getAnnotations(EX)[0])).toEqual(["b"]);
    // The page drawn here and not sent yet is the later save, so it stays.
    expect(colours(result.current.getAnnotations(EX)[1])).toEqual(["mine"]);
    expect(onReplaced).toHaveBeenCalledWith([
      { exerciseId: EX, pageIndex: 0, byName: "Ms Other", byEmail: "me@example.com" },
    ]);
    expect(result.current.inkRevision).toBe(2);
  });

  it("rebuilds undo for ink that came from the server", async () => {
    const { result } = await mount([onServer([stroke("a"), stroke("b")])]);

    let afterUndo = null as ReturnType<typeof result.current.undo>;
    act(() => { afterUndo = result.current.undo(EX); });
    expect(colours(afterUndo?.[0])).toEqual(["a"]);
  });

  it("stops sending a page the server dropped because its exercise has gone", async () => {
    const { result } = await mount([]);
    api.save.mockResolvedValue({ saved: [], dropped: [{ session_id: 100, target_key: "ex:1", page_index: 0 }] });
    act(() => draw(result.current, 0, stroke("a")));

    await tick(2000);
    await tick(60_000);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(result.current.syncStatus).toBe("saved");
  });

  it("sends everything at once when asked, so the view can close", async () => {
    const { result } = await mount([]);
    api.save.mockResolvedValue(savedAs(0, 1));
    act(() => draw(result.current, 0, stroke("a")));

    let done = false;
    await act(async () => { done = await result.current.flushInk(); });
    expect(done).toBe(true);
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it("keeps only the pages it hasn't sent in the tab", async () => {
    const { result } = await mount([onServer([stroke("a")])]);
    api.save.mockResolvedValue(savedAs(1, 1));
    act(() => draw(result.current, 1, stroke("b")));

    await tick(500);
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({ [EX]: { 1: [expect.objectContaining({ color: "b" })] } });
    await tick(2000);
    await tick(500);
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({});
  });

  it("never calls the server when saving to it isn't turned on", async () => {
    const { result } = renderHook(() => useAnnotations(KEY));
    draw(result.current, 0, stroke("a"));

    await tick(5000);
    expect(api.read).not.toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
  });
});
