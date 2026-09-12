import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAnnotations, inkLayers, getStrokeOptions, hasInk, type Stroke } from "./useAnnotations";

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
