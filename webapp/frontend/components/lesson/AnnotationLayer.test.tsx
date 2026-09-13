import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import { AnnotationLayer } from "./AnnotationLayer";
import type { Stroke } from "@/hooks/useAnnotations";

// The layer maps pointer positions through the SVG's on-screen box. jsdom has
// no layout, so give every element a 100 by 100 box at the origin, which makes
// page units and screen pixels the same.
const originalRect = Element.prototype.getBoundingClientRect;
const originalCapture = Element.prototype.setPointerCapture;
beforeAll(() => {
  Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  Element.prototype.setPointerCapture = () => {};
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = originalRect;
  Element.prototype.setPointerCapture = originalCapture;
});

// A horizontal line across the middle of the page.
const LINE: Stroke = {
  points: [[0, 50, 0.5], [25, 50, 0.5], [50, 50, 0.5], [75, 50, 0.5], [100, 50, 0.5]],
  color: "#dc2626",
  size: 2,
};

function renderLayer(eraserRadius: number | null, onStrokesChange = vi.fn()) {
  const { container } = render(
    <AnnotationLayer
      width={100}
      height={100}
      strokes={[LINE]}
      isDrawing={false}
      isErasing
      eraserRadius={eraserRadius}
      penColor="#dc2626"
      penSize={2}
      onStrokesChange={onStrokesChange}
    />
  );
  return { svg: container.querySelector("svg")!, onStrokesChange };
}

describe("AnnotationLayer rubbing eraser", () => {
  it("saves one whole drag as a single change, with the line cut in two", () => {
    const { svg, onStrokesChange } = renderLayer(5);

    fireEvent.pointerDown(svg, { clientX: 45, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 48, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 52, clientY: 80, pointerId: 1 });
    expect(onStrokesChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(svg, { clientX: 52, clientY: 80, pointerId: 1 });

    expect(onStrokesChange).toHaveBeenCalledTimes(1);
    const pieces: Stroke[] = onStrokesChange.mock.calls[0][0];
    expect(pieces).toHaveLength(2);
    expect(pieces[0].points.at(-1)![0]).toBeLessThan(48);
    expect(pieces[1].points[0][0]).toBeGreaterThan(48);
  });

  it("reports nothing when the drag misses every stroke", () => {
    const { svg, onStrokesChange } = renderLayer(5);

    fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 90, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 90, clientY: 10, pointerId: 1 });

    expect(onStrokesChange).not.toHaveBeenCalled();
  });

  it("shows a circle the size of the eraser under the pointer", () => {
    const { svg } = renderLayer(5);

    fireEvent.pointerMove(svg, { clientX: 30, clientY: 40, pointerId: 1 });
    const circle = svg.querySelector("circle")!;

    expect(circle.getAttribute("cx")).toBe("30");
    expect(circle.getAttribute("cy")).toBe("40");
    expect(circle.getAttribute("r")).toBe("5");
  });

  it("leaves the whole-stroke eraser alone, where a drag on the page erases nothing", () => {
    const { svg, onStrokesChange } = renderLayer(null);

    fireEvent.pointerDown(svg, { clientX: 45, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 52, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 52, clientY: 80, pointerId: 1 });

    expect(onStrokesChange).not.toHaveBeenCalled();
    expect(svg.querySelector("circle")).toBeNull();
  });
});

describe("AnnotationLayer pen and highlighter", () => {
  function renderDrawing(props: Partial<React.ComponentProps<typeof AnnotationLayer>> = {}) {
    const onStrokesChange = vi.fn();
    const utils = render(
      <AnnotationLayer
        width={100}
        height={100}
        strokes={[]}
        isDrawing
        isErasing={false}
        penColor="#facc15"
        penSize={20}
        onStrokesChange={onStrokesChange}
        {...props}
      />
    );
    return { ...utils, svg: utils.container.querySelector("svg")!, onStrokesChange };
  }

  function drawLine(svg: SVGSVGElement) {
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 90, clientY: 50, pointerId: 1 });
  }

  it("marks a stroke drawn with the highlighter as highlighter ink", () => {
    const { svg, onStrokesChange } = renderDrawing({ inkKind: "highlighter" });
    drawLine(svg);
    const [stroke] = onStrokesChange.mock.calls[0][0] as Stroke[];
    expect(stroke.kind).toBe("highlighter");
    expect(stroke.color).toBe("#facc15");
  });

  it("leaves pen strokes unmarked, the same as ink saved before the highlighter", () => {
    const { svg, onStrokesChange } = renderDrawing({ penColor: "#dc2626", penSize: 3 });
    drawLine(svg);
    const [stroke] = onStrokesChange.mock.calls[0][0] as Stroke[];
    expect(stroke).not.toHaveProperty("kind");
  });

  it("paints highlighter ink underneath pen ink, whatever order they were drawn in", () => {
    const highlight: Stroke = { ...LINE, color: "#facc15", size: 20, kind: "highlighter" };
    const { svg } = renderDrawing({ isDrawing: false, strokes: [LINE, highlight] });
    const paths = [...svg.querySelectorAll("path")];
    expect(paths.map((p) => p.getAttribute("fill"))).toEqual(["#facc15", "#dc2626"]);
    expect(paths[0].getAttribute("opacity")).toBe("0.35");
  });

  it("keeps a tap as a dot, for a decimal point or the dot on an i", () => {
    const { svg, onStrokesChange, rerender } = renderDrawing({ penColor: "#dc2626", penSize: 3 });
    fireEvent.pointerDown(svg, { clientX: 40, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 40, clientY: 60, pointerId: 1 });

    expect(onStrokesChange).toHaveBeenCalledTimes(1);
    const [dot] = onStrokesChange.mock.calls[0][0] as Stroke[];
    expect(dot.points).toHaveLength(1);

    // And the dot is drawn, as a closed shape around the point.
    rerender(
      <AnnotationLayer
        width={100} height={100} strokes={[dot]} isDrawing={false} isErasing={false}
        penColor="#dc2626" penSize={3} onStrokesChange={onStrokesChange}
      />
    );
    expect(svg.querySelector("path")?.getAttribute("d")).toMatch(/^M .* Z$/);
  });

  it("draws a straight line from where the finger went down to where it lifted, levelled when it's nearly level", () => {
    const { svg, onStrokesChange } = renderDrawing({ straight: true });
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 40, clientY: 58, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 90, clientY: 53, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 90, clientY: 53, pointerId: 1 });

    const [line] = onStrokesChange.mock.calls[0][0] as Stroke[];
    expect(line.points.map(([x, y]) => [x, y])).toEqual([[10, 50], [90, 50]]);
  });

  it("leaves a slanted straight line at the angle it was drawn", () => {
    const { svg, onStrokesChange } = renderDrawing({ straight: true });
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 60, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 60, clientY: 40, pointerId: 1 });

    const [line] = onStrokesChange.mock.calls[0][0] as Stroke[];
    expect(line.points.map(([x, y]) => [x, y])).toEqual([[10, 10], [60, 40]]);
  });

  it("throws away a half-drawn line when a second finger turns the touch into a scroll", () => {
    const { svg, onStrokesChange, rerender } = renderDrawing();
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 50, clientY: 50, pointerId: 1 });

    rerender(
      <AnnotationLayer
        width={100} height={100} strokes={[]} isDrawing isErasing={false}
        penColor="#facc15" penSize={20} onStrokesChange={onStrokesChange} suspended
      />
    );
    fireEvent.pointerUp(svg, { clientX: 90, clientY: 50, pointerId: 1 });

    expect(onStrokesChange).not.toHaveBeenCalled();
    expect(svg.querySelector("path")).toBeNull();
  });
});

describe("AnnotationLayer fading ink", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function renderFading() {
    const onStrokesChange = vi.fn();
    const { container } = render(
      <AnnotationLayer
        width={100} height={100} strokes={[]} isDrawing isErasing={false}
        penColor="#2563eb" penSize={3} fading onStrokesChange={onStrokesChange}
      />
    );
    return { svg: container.querySelector("svg")!, onStrokesChange };
  }

  function point(svg: SVGSVGElement, from: number, to: number) {
    fireEvent.pointerDown(svg, { clientX: from, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: to, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: to, clientY: 50, pointerId: 1 });
  }

  const marks = (svg: SVGSVGElement) => svg.querySelectorAll("[data-fading-ink] path").length;

  it("never saves its marks, and fades them away a few seconds after you stop", () => {
    const { svg, onStrokesChange } = renderFading();
    point(svg, 10, 90);

    expect(onStrokesChange).not.toHaveBeenCalled();
    expect(marks(svg)).toBe(1);
    expect(svg.querySelector("[data-fading-ink] path")?.getAttribute("fill")).toBe("#ef4444");

    act(() => { vi.advanceTimersByTime(3000); });
    expect(marks(svg)).toBe(1);
    act(() => { vi.advanceTimersByTime(600); });
    expect(marks(svg)).toBe(0);
  });

  it("keeps every mark while you keep pointing, even on another page, then fades them together", () => {
    const first = renderFading();
    const second = renderFading();
    point(first.svg, 10, 40);
    act(() => { vi.advanceTimersByTime(2500); });
    point(second.svg, 50, 90);
    act(() => { vi.advanceTimersByTime(2500); });

    expect(marks(first.svg)).toBe(1);
    expect(marks(second.svg)).toBe(1);

    act(() => { vi.advanceTimersByTime(1100); });
    expect(marks(first.svg)).toBe(0);
    expect(marks(second.svg)).toBe(0);
  });
});

describe("AnnotationLayer lasso", () => {
  // A short tick near the top left, well away from LINE across the middle.
  const TICK: Stroke = { points: [[10, 10, 0.5], [15, 15, 0.5], [20, 10, 0.5]], color: "#2563eb", size: 3 };
  const ROUND_TICK: [number, number][] = [[5, 5], [25, 5], [25, 20], [5, 20]];

  const lassoProps = () => ({
    width: 100,
    height: 100,
    isDrawing: false,
    isErasing: false,
    isSelecting: true,
    penColor: "#dc2626",
    penSize: 2,
    onStrokesChange: vi.fn(),
  });

  function renderLasso() {
    const props = lassoProps();
    const utils = render(<AnnotationLayer {...props} strokes={[LINE, TICK]} />);
    return { ...utils, props, svg: utils.container.querySelector("svg")!, onStrokesChange: props.onStrokesChange };
  }

  // Draw a loop through these points with one finger.
  function drawLoop(svg: Element, points: [number, number][]) {
    const [[x0, y0], ...rest] = points;
    fireEvent.pointerDown(svg, { clientX: x0, clientY: y0, pointerId: 1 });
    for (const [x, y] of rest) fireEvent.pointerMove(svg, { clientX: x, clientY: y, pointerId: 1 });
    const [x, y] = points[points.length - 1];
    fireEvent.pointerUp(svg, { clientX: x, clientY: y, pointerId: 1 });
  }

  const deleteButton = () => screen.queryByRole("button", { name: "Delete" });
  // Pointer positions go through the page's on-screen box, which leaves a trace of rounding.
  const rounded = (s: Stroke) => s.points.map((point) => point.map((v) => Math.round(v * 1000) / 1000));

  it("selects the ink inside a loop, and deletes it as one change", () => {
    const { svg, onStrokesChange } = renderLasso();
    drawLoop(svg, ROUND_TICK);
    fireEvent.click(deleteButton()!);

    expect(onStrokesChange).toHaveBeenCalledTimes(1);
    expect(onStrokesChange).toHaveBeenCalledWith([LINE]);
    expect(deleteButton()).toBeNull();
  });

  it("selects nothing when the loop goes round no ink, and a tap on the page lets go of a selection", () => {
    const { svg } = renderLasso();
    drawLoop(svg, [[60, 60], [90, 60], [90, 90], [60, 90]]);
    expect(deleteButton()).toBeNull();

    drawLoop(svg, ROUND_TICK);
    expect(deleteButton()).not.toBeNull();
    drawLoop(svg, [[80, 80]]);
    expect(deleteButton()).toBeNull();
  });

  it("moves the selection as one change when the finger lifts, and leaves the other ink alone", () => {
    const { svg, container, onStrokesChange } = renderLasso();
    drawLoop(svg, ROUND_TICK);
    const box = container.querySelector("[data-ink-selection]")!;

    fireEvent.pointerDown(box, { clientX: 15, clientY: 12, pointerId: 2 });
    fireEvent.pointerMove(box, { clientX: 35, clientY: 22, pointerId: 2 });
    fireEvent.pointerMove(box, { clientX: 55, clientY: 42, pointerId: 2 });
    expect(onStrokesChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(box, { clientX: 55, clientY: 42, pointerId: 2 });

    expect(onStrokesChange).toHaveBeenCalledTimes(1);
    const [line, tick]: Stroke[] = onStrokesChange.mock.calls[0][0];
    expect(line).toBe(LINE);
    expect(rounded(tick)).toEqual([[50, 40, 0.5], [55, 45, 0.5], [60, 40, 0.5]]);
    expect(tick.size).toBe(3);
  });

  it("resizes from the corner handle, keeping the top-left corner still and the pen width the same", () => {
    const { svg, onStrokesChange } = renderLasso();
    drawLoop(svg, ROUND_TICK);
    const handle = screen.getByTitle("Drag to resize");

    fireEvent.pointerDown(handle, { clientX: 20, clientY: 15, pointerId: 2 });
    fireEvent.pointerMove(handle, { clientX: 30, clientY: 20, pointerId: 2 });
    fireEvent.pointerUp(handle, { clientX: 30, clientY: 20, pointerId: 2 });

    expect(onStrokesChange).toHaveBeenCalledTimes(1);
    const [, tick]: Stroke[] = onStrokesChange.mock.calls[0][0];
    expect(rounded(tick)).toEqual([[10, 10, 0.5], [20, 20, 0.5], [30, 10, 0.5]]);
    expect(tick.size).toBe(3);
  });

  it("deletes the selection with the Delete key", () => {
    const { svg, onStrokesChange } = renderLasso();
    drawLoop(svg, ROUND_TICK);
    fireEvent.keyDown(window, { key: "Delete" });
    expect(onStrokesChange).toHaveBeenCalledWith([LINE]);
  });

  it("lets go of the selection once its ink leaves the page, and doesn't take it back when the ink returns", () => {
    const { svg, rerender, props } = renderLasso();
    drawLoop(svg, ROUND_TICK);
    // An undo takes the tick away, and a redo puts it back.
    rerender(<AnnotationLayer {...props} strokes={[LINE]} />);
    expect(deleteButton()).toBeNull();
    rerender(<AnnotationLayer {...props} strokes={[LINE, TICK]} />);
    expect(deleteButton()).toBeNull();
  });

  it("lets go of the selection when another tool is picked", () => {
    const { svg, rerender, props } = renderLasso();
    drawLoop(svg, ROUND_TICK);
    rerender(<AnnotationLayer {...props} strokes={[LINE, TICK]} isSelecting={false} isDrawing />);
    expect(deleteButton()).toBeNull();
  });

  it("keeps one selection at a time across every page", () => {
    const props = lassoProps();
    render(
      <>
        <div data-testid="first"><AnnotationLayer {...props} strokes={[TICK]} /></div>
        <div data-testid="second"><AnnotationLayer {...props} strokes={[TICK]} /></div>
      </>
    );
    drawLoop(screen.getByTestId("first").querySelector("svg")!, ROUND_TICK);
    drawLoop(screen.getByTestId("second").querySelector("svg")!, ROUND_TICK);

    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(1);
    expect(within(screen.getByTestId("second")).getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("throws away a half-drawn loop when a second finger turns the touch into a scroll", () => {
    const { svg, container, rerender, props } = renderLasso();
    fireEvent.pointerDown(svg, { clientX: 5, clientY: 5, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 25, clientY: 5, pointerId: 1 });
    expect(container.querySelector("[data-lasso-loop]")).not.toBeNull();

    rerender(<AnnotationLayer {...props} strokes={[LINE, TICK]} suspended />);
    expect(container.querySelector("[data-lasso-loop]")).toBeNull();
    fireEvent.pointerMove(svg, { clientX: 25, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 5, clientY: 20, pointerId: 1 });
    expect(deleteButton()).toBeNull();
  });
});
