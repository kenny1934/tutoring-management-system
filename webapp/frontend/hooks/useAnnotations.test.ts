import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAnnotations, inkLayers, type Stroke } from "./useAnnotations";

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

describe("inkLayers", () => {
  it("puts every highlighter stroke in the layer under the pen strokes, keeping each layer's order", () => {
    const pen1 = stroke("red");
    const hl1: Stroke = { ...stroke("yellow"), kind: "highlighter" };
    const pen2 = stroke("blue");
    const hl2: Stroke = { ...stroke("pink"), kind: "highlighter" };
    expect(inkLayers([pen1, hl1, pen2, hl2])).toEqual([[hl1, hl2], [pen1, pen2]]);
  });
});
