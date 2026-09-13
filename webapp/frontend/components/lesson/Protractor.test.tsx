import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useRef } from "react";
import { Protractor } from "./Protractor";
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
// Each test starts with no size remembered, so the protractor is 10 cm across.
beforeEach(() => localStorage.clear());

// A protractor at 10 pixels to the centimetre, so 10 cm across is 50 from its
// centre mark to its curved edge, with a strip 8 tall. Its middle starts at
// (200, 279), which puts its centre mark at (200, 300).
function Harness({ onHide = () => {}, guides }: { onHide?: () => void; guides: Set<DrawingGuide> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef}>
      <Protractor containerRef={containerRef} cm={10} start={[200, 279]} guides={guides} darkMode={false} onHide={onHide} />
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

/**
 * A page that takes the whole screen, with these points in its ink for the
 * protractor to snap onto. It snaps within half a centimetre, which is 5 pixels here.
 */
function registerPage(points: Vec[]) {
  const page: InkPage = {
    index: 0, label: "Page 1", width: 1000, height: 1000, onPagesChange: () => {}, strokes: () => [], receive: () => {},
    contains: () => true, startLine: () => null,
    snapNear: (at) => points.find((p) => Math.hypot(p[0] - at[0], p[1] - at[1]) <= 5) ?? null,
  };
  return registerInkPage("protractor-test-page", page);
}

describe("Protractor", () => {
  it("starts 10 cm across with its centre mark on its baseline, and its X hides it", () => {
    const onHide = vi.fn();
    render(<Harness onHide={onHide} guides={new Set()} />);
    expect(protractor().style.left).toBe("150px");
    expect(protractor().style.top).toBe("250px");
    fireEvent.click(screen.getByRole("button", { name: "Hide the protractor" }));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("moves with one finger, and shows its tilt only while it's held", () => {
    render(<Harness guides={new Set()} />);
    expect(protractor()).not.toHaveTextContent("°");

    fireEvent.pointerDown(protractor(), touch(1, 200, 270));
    expect(protractor()).toHaveTextContent("0°");
    fireEvent.pointerMove(protractor(), touch(1, 220, 280));
    fireEvent.pointerUp(protractor(), touch(1, 220, 280));

    expect(protractor().style.left).toBe("170px");
    expect(protractor().style.top).toBe("260px");
    expect(protractor()).not.toHaveTextContent("°");
  });

  it("resizes about its centre mark from its handle, between 8 and 20 cm, and remembers the size", () => {
    render(<Harness guides={new Set()} />);
    const handle = screen.getByRole("img", { name: "Drag to resize" });

    // From 50 pixels out to 70 takes it from 10 cm across to 14, and its centre mark stays at (200, 300).
    fireEvent.pointerDown(handle, touch(1, 150, 300));
    fireEvent.pointerMove(handle, touch(1, 130, 300));
    fireEvent.pointerUp(handle, touch(1, 130, 300));
    expect(protractor().style.left).toBe("130px");
    expect(protractor().style.top).toBe("230px");
    expect(localStorage.getItem("csm_protractor_size")).toBe("14");

    // A drag almost to the centre stops at 8 cm.
    fireEvent.pointerDown(handle, touch(2, 130, 300));
    fireEvent.pointerMove(handle, touch(2, 195, 300));
    fireEvent.pointerUp(handle, touch(2, 195, 300));
    expect(protractor().style.left).toBe("160px");
    expect(localStorage.getItem("csm_protractor_size")).toBe("8");
  });

  it("comes back at the size this board last left it at", () => {
    localStorage.setItem("csm_protractor_size", "16");
    render(<Harness guides={new Set()} />);
    // 16 cm across is 80 pixels from the centre mark to the curved edge.
    expect(protractor().style.width).toBe("160px");
  });

  it("guides a ray from the hole at its centre, turned to whole degrees, and shows both readings while it's drawn", () => {
    const { guide } = renderWithGuide();
    const line = guide.lineFrom([201, 299], 0)!;
    let ends: Vec[] = [];
    act(() => {
      ends = line.to(point(40, 34.6));
    });
    expect(ends[0]).toEqual([200, 300]);
    expect(protractor()).toHaveTextContent("35° / 145°");

    act(() => line.end?.());
    expect(protractor()).not.toHaveTextContent("°");
  });

  it("guides an arc just outside its curved edge, with a point for every degree, and shows how far it spans", () => {
    const { guide } = renderWithGuide();
    const line = guide.lineFrom(point(60, 0.2), 2)!;
    let points: Vec[] = [];
    act(() => {
      points = line.to(point(70, 60.3));
    });
    expect(points).toHaveLength(61);
    expect(protractor()).toHaveTextContent("60°");
  });

  it("snaps its centre mark onto a point in the ink as it's dragged near, and shows a ring there", () => {
    const off = registerPage([[260, 300]]);
    const { container } = render(<Harness guides={new Set()} />);
    // The drag carries the centre mark from (200, 300) to (258, 302), within half a centimetre of the point.
    fireEvent.pointerDown(protractor(), touch(1, 200, 270));
    fireEvent.pointerMove(protractor(), touch(1, 258, 272));
    expect(protractor().style.left).toBe("210px");
    expect(protractor().style.top).toBe("250px");
    expect(container.querySelectorAll("[data-pinned]")).toHaveLength(1);

    // Further away, it lets go and follows the finger again.
    fireEvent.pointerMove(protractor(), touch(1, 280, 272));
    expect(protractor().style.left).toBe("230px");
    expect(container.querySelectorAll("[data-pinned]")).toHaveLength(0);
    fireEvent.pointerUp(protractor(), touch(1, 280, 272));
    off();
  });

  it("runs a ray exactly to a point in the ink its end comes near, reading the nearest whole degree", () => {
    const target = point(40, 34.6);
    const off = registerPage([target]);
    const { guide, container } = renderWithGuide();
    const line = guide.lineFrom([201, 299], 0)!;
    let ends: Vec[] = [];
    act(() => {
      ends = line.to(point(41, 36));
    });
    expect(ends).toEqual([[200, 300], target]);
    expect(protractor()).toHaveTextContent("35° / 145°");
    expect(container.querySelectorAll("[data-pinned]")).toHaveLength(1);

    act(() => line.end?.());
    expect(container.querySelectorAll("[data-pinned]")).toHaveLength(0);
    off();
  });

  it("guides nothing from a start on its plastic, and leaves the guides once it's put away", () => {
    const { guide, guides, unmount } = renderWithGuide();
    expect(guide.lineFrom(point(30, 90), 0)).toBeNull();
    unmount();
    expect(guides.size).toBe(0);
  });
});
