import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useRef, useState } from "react";
import { Ruler } from "./Ruler";
import type { DrawingGuide } from "@/lib/drawing-guide";
import { registerInkPage, type InkPage } from "@/hooks/useInkPages";
import type { Vec } from "@/lib/stroke-select";

// jsdom lays nothing out, so the container sits at the screen's corner at its
// own size, which makes its pixels and screen pixels the same.
const originalRect = Element.prototype.getBoundingClientRect;
beforeAll(() => {
  Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = originalRect;
});

const LABEL = "Ruler: drag it to move it, or turn it with two fingers or the mouse wheel";

// A ruler at 10 pixels to the centimetre, so 160 long and 30 tall, centred at (200, 300).
function Harness({ onHide = () => {}, guides }: { onHide?: () => void; guides?: Set<DrawingGuide> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ownGuides] = useState(() => new Set<DrawingGuide>());
  return (
    <div ref={containerRef}>
      <Ruler containerRef={containerRef} cm={10} start={[200, 300]} guides={guides ?? ownGuides} darkMode={false} onHide={onHide} />
    </div>
  );
}

const ruler = () => screen.getByRole("group", { name: LABEL });
const touch = (pointerId: number, clientX: number, clientY: number) => ({ pointerId, clientX, clientY, pointerType: "touch" });

describe("Ruler", () => {
  it("lies level with its angle showing, and its X hides it", () => {
    const onHide = vi.fn();
    render(<Harness onHide={onHide} />);
    expect(ruler()).toHaveTextContent("0°");
    fireEvent.click(screen.getByRole("button", { name: "Hide the ruler" }));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("moves with one finger", () => {
    render(<Harness />);
    expect(ruler().style.left).toBe("120px");
    expect(ruler().style.top).toBe("285px");

    fireEvent.pointerDown(ruler(), touch(1, 150, 300));
    fireEvent.pointerMove(ruler(), touch(1, 170, 310));
    fireEvent.pointerUp(ruler(), touch(1, 170, 310));

    expect(ruler().style.left).toBe("140px");
    expect(ruler().style.top).toBe("295px");
  });

  it("turns with a second finger that lands just beside it, and keeps that finger from the page", () => {
    render(<Harness />);
    fireEvent.pointerDown(ruler(), touch(1, 150, 300));
    const page = vi.fn();
    document.body.addEventListener("pointerdown", page);

    // 20 pixels below the middle line, which is 5 below the ruler's edge.
    fireEvent.pointerDown(document.body, touch(2, 250, 320));
    expect(page).not.toHaveBeenCalled();
    // A quarter turn of the second finger about the first turns the ruler upright.
    fireEvent.pointerMove(ruler(), touch(2, 130, 400));
    expect(ruler()).toHaveTextContent("90°");

    document.body.removeEventListener("pointerdown", page);
  });

  it("leaves a finger further away to the page, so you can draw while you hold it", () => {
    render(<Harness />);
    fireEvent.pointerDown(ruler(), touch(1, 150, 300));
    const page = vi.fn();
    document.body.addEventListener("pointerdown", page);

    fireEvent.pointerDown(document.body, touch(2, 250, 360));
    expect(page).toHaveBeenCalledTimes(1);

    document.body.removeEventListener("pointerdown", page);
  });

  it("turns with the mouse wheel, a degree at a time or 15 with Shift", () => {
    render(<Harness />);
    fireEvent.wheel(ruler(), { deltaY: 100 });
    expect(ruler()).toHaveTextContent("1°");
    fireEvent.wheel(ruler(), { deltaY: 100, shiftKey: true });
    expect(ruler()).toHaveTextContent("16°");
    // The X turns back against the ruler, so it still reads as an X.
    const x = screen.getByRole("button", { name: "Hide the ruler" }).querySelector("svg")!;
    expect(x.style.transform).toBe("rotate(-16deg)");
  });

  it("guides a line along its edge for the drawing layers while it's out", () => {
    const guides = new Set<DrawingGuide>();
    const { unmount } = render(<Harness guides={guides} />);
    const [guide] = guides;

    // A line that starts 15 pixels below the ruler runs along its bottom edge, 15 below the middle line.
    const line = guide.lineFrom([200, 330], 0);
    expect(line?.to([250, 340])[1][1]).toBeCloseTo(315);
    expect(guide.lineFrom([200, 400], 0)).toBeNull();

    unmount();
    expect(guides.size).toBe(0);
  });

  it("draws a line from mark to mark along its edge, and shows its length while it's drawn", () => {
    const guides = new Set<DrawingGuide>();
    render(<Harness guides={guides} />);
    const [guide] = guides;

    // At 10 pixels to the centimetre, each millimetre mark is a whole pixel along the edge.
    const line = guide.lineFrom([150.4, 330], 0)!;
    let ends: Vec[] = [];
    act(() => { ends = line.to([210.6, 340]); });
    expect(ends).toEqual([[150, 315], [211, 315]]);
    expect(ruler()).toHaveTextContent("6.1 cm");

    // Once the finger lifts, the ruler shows its angle again.
    act(() => line.end!());
    expect(ruler()).toHaveTextContent("0°");
  });

  it("pins a line along its edge onto points in the ink near its ends, with a ring at each", () => {
    // A page with two points in its ink, one near each end of the line below.
    // It snaps within half a centimetre, which is 5 pixels here.
    const points: Vec[] = [[151, 317], [249, 316]];
    const page: InkPage = {
      index: 0, label: "Page 1", width: 1000, height: 1000, onPagesChange: () => {}, strokes: () => [], receive: () => {},
      contains: () => true, startLine: () => null,
      snapNear: (at) => points.find((p) => Math.hypot(p[0] - at[0], p[1] - at[1]) <= 5) ?? null,
    };
    const off = registerInkPage("ruler-test-page", page);
    const guides = new Set<DrawingGuide>();
    const { container } = render(<Harness guides={guides} />);
    const [guide] = guides;

    // With both ends near a point, the line joins the two points exactly.
    const line = guide.lineFrom([150, 330], 0)!;
    let ends: Vec[] = [];
    act(() => { ends = line.to([250, 340]); });
    expect(ends).toEqual(points);
    expect(container.querySelectorAll("[data-pinned]")).toHaveLength(2);

    // With only the start near one, the line runs from it in the ruler's direction.
    act(() => { ends = line.to([200, 340]); });
    expect(ends).toEqual([[151, 317], [200, 317]]);
    expect(container.querySelectorAll("[data-pinned]")).toHaveLength(1);

    act(() => line.end!());
    expect(container.querySelectorAll("[data-pinned]")).toHaveLength(0);
    off();
  });
});
