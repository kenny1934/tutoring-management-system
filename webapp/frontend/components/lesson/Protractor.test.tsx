import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useRef } from "react";
import { Protractor } from "./Protractor";
import type { DrawingGuide } from "@/lib/ruler";
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

// A protractor at 10 pixels to the centimetre, so 70 from its centre mark to
// its curved edge with a strip 10 tall. Its middle starts at (200, 270), which
// puts its centre mark at (200, 300).
function Harness({ onHide = () => {}, guides }: { onHide?: () => void; guides: Set<DrawingGuide> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef}>
      <Protractor containerRef={containerRef} cm={10} start={[200, 270]} guides={guides} darkMode={false} onHide={onHide} />
    </div>
  );
}

const protractor = () => screen.getByRole("group", { name: /^Protractor:/ });
const touch = (pointerId: number, clientX: number, clientY: number) => ({ pointerId, clientX, clientY, pointerType: "touch" });
/** The point this far from the centre mark, at this many degrees round from the right. */
const point = (r: number, degrees: number): Vec => [
  200 + r * Math.cos((degrees * Math.PI) / 180),
  300 - r * Math.sin((degrees * Math.PI) / 180),
];

/** The pane's one guide, which the protractor adds while it's out. */
function renderWithGuide() {
  const guides = new Set<DrawingGuide>();
  const utils = render(<Harness guides={guides} />);
  const [guide] = guides;
  return { ...utils, guides, guide };
}

describe("Protractor", () => {
  it("sits with its centre mark on its baseline, and its X hides it", () => {
    const onHide = vi.fn();
    render(<Harness onHide={onHide} guides={new Set()} />);
    expect(protractor().style.left).toBe("130px");
    expect(protractor().style.top).toBe("230px");
    fireEvent.click(screen.getByRole("button", { name: "Hide the protractor" }));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("moves with one finger, and shows its tilt only while it's held", () => {
    render(<Harness guides={new Set()} />);
    expect(protractor()).not.toHaveTextContent("°");

    fireEvent.pointerDown(protractor(), touch(1, 200, 260));
    expect(protractor()).toHaveTextContent("0°");
    fireEvent.pointerMove(protractor(), touch(1, 220, 270));
    fireEvent.pointerUp(protractor(), touch(1, 220, 270));

    expect(protractor().style.left).toBe("150px");
    expect(protractor().style.top).toBe("240px");
    expect(protractor()).not.toHaveTextContent("°");
  });

  it("guides a ray from the hole at its centre, turned to whole degrees, and shows both readings while it's drawn", () => {
    const { guide } = renderWithGuide();
    const line = guide.lineFrom([201, 299], 0)!;
    let ends: Vec[] = [];
    act(() => {
      ends = line.to(point(50, 34.6));
    });
    expect(ends[0]).toEqual([200, 300]);
    expect(protractor()).toHaveTextContent("35° / 145°");

    act(() => line.end?.());
    expect(protractor()).not.toHaveTextContent("°");
  });

  it("guides an arc just outside its curved edge, with a point for every degree, and shows how far it spans", () => {
    const { guide } = renderWithGuide();
    const line = guide.lineFrom(point(80, 0.2), 2)!;
    let points: Vec[] = [];
    act(() => {
      points = line.to(point(90, 60.3));
    });
    expect(points).toHaveLength(61);
    expect(protractor()).toHaveTextContent("60°");
  });

  it("guides nothing from a start on its plastic, and leaves the guides once it's put away", () => {
    const { guide, guides, unmount } = renderWithGuide();
    expect(guide.lineFrom(point(40, 90), 0)).toBeNull();
    unmount();
    expect(guides.size).toBe(0);
  });
});
