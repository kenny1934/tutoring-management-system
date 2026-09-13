import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import { Compass } from "./Compass";
import { registerInkPage, type DrivenLine, type InkPage } from "@/hooks/useInkPages";
import { hingeHeight } from "@/lib/compass";
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

// Compasses at 10 pixels to the centimetre, opened to their usual 4 cm, which
// is 40 pixels. This start puts the needle at (200, 300) and the pencil at (240, 300).
const START: Vec = [220, 300 - (hingeHeight(4) * 10) / 2];

function Harness({ onHide = () => {} }: { onHide?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef}>
      <Compass containerRef={containerRef} cm={10} start={START} darkMode={false} onHide={onHide} />
    </div>
  );
}

const compasses = () => screen.getByRole("group", { name: /^Compasses:/ });
const touch = (pointerId: number, clientX: number, clientY: number) => ({ pointerId, clientX, clientY, pointerType: "touch" });

/**
 * A page that takes the whole screen, whose drawing layer hands back this
 * line, or none, and has one point in its ink for the compasses to snap onto.
 */
function registerPage(line: DrivenLine | null, point: Vec = [900, 900]) {
  const startLine = vi.fn(() => line);
  const page: InkPage = {
    index: 0, label: "Page 1", width: 1000, height: 1000, onPagesChange: () => {}, strokes: () => [], receive: () => {},
    contains: () => true, startLine,
    snapNear: (at, reach) => (Math.hypot(at[0] - point[0], at[1] - point[1]) <= reach ? point : null),
  };
  return { startLine, off: registerInkPage("compass-test-page", page) };
}

describe("Compass", () => {
  it("puts its needle where it starts, shows no width until it's used, and its X hides it", () => {
    const onHide = vi.fn();
    render(<Harness onHide={onHide} />);
    expect(compasses().style.left).toBe("200px");
    expect(compasses().style.width).toBe("40px");
    expect(screen.queryByText("4.0 cm")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Hide the compasses" }));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("moves by its legs at the same width, and shows the width while it's held", () => {
    render(<Harness />);
    fireEvent.pointerDown(compasses(), touch(1, 210, 280));
    expect(screen.getByText("4.0 cm")).toBeInTheDocument();
    fireEvent.pointerMove(compasses(), touch(1, 230, 290));
    fireEvent.pointerUp(compasses(), touch(1, 230, 290));

    expect(compasses().style.left).toBe("220px");
    expect(compasses().style.width).toBe("40px");
    expect(screen.queryByText("4.0 cm")).toBeNull();
  });

  it("opens from the pencil's grip with the needle kept still, snapping to whole millimetres", () => {
    render(<Harness />);
    const grip = screen.getByRole("img", { name: "Drag to open or close" });
    fireEvent.pointerDown(grip, touch(1, 235, 280));
    // The pencil follows the finger 21.3 pixels further out, to 61.3 from the needle.
    fireEvent.pointerMove(grip, touch(1, 256.3, 280));
    expect(screen.getByText("6.1 cm")).toBeInTheDocument();
    fireEvent.pointerUp(grip, touch(1, 256.3, 280));

    expect(compasses().style.left).toBe("200px");
    expect(compasses().style.width).toBe("61px");
  });

  it("turns round the needle from the handle at the top, drawing an arc on the page under the pencil", () => {
    const line: DrivenLine = { to: vi.fn(), end: vi.fn() };
    const { startLine, off } = registerPage(line);
    render(<Harness />);
    const handle = screen.getByRole("img", { name: "Turn to draw" });

    // A quarter turn of the finger round the needle, from straight above it to straight right of it.
    fireEvent.pointerDown(handle, touch(1, 200, 250));
    fireEvent.pointerMove(handle, touch(1, 250, 300));
    expect(startLine).toHaveBeenCalledWith([240, 300]);
    const arc = vi.mocked(line.to).mock.lastCall![0];
    expect(arc).toHaveLength(91);
    expect(arc[90][0]).toBeCloseTo(200);
    expect(arc[90][1]).toBeCloseTo(340);
    expect(screen.getByText("4.0 cm")).toBeInTheDocument();
    fireEvent.pointerUp(handle, touch(1, 250, 300));

    expect(line.end).toHaveBeenCalledTimes(1);
    expect(compasses().style.transform).toBe("rotate(90deg)");
    off();
  });

  it("leaves no mark when the handle is only tapped, and turns without drawing when the page takes no line", () => {
    const { startLine, off } = registerPage(null);
    render(<Harness />);
    const handle = screen.getByRole("img", { name: "Turn to draw" });

    fireEvent.pointerDown(handle, touch(1, 200, 250));
    fireEvent.pointerUp(handle, touch(1, 200, 250));
    expect(startLine).not.toHaveBeenCalled();

    fireEvent.pointerDown(handle, touch(2, 200, 250));
    fireEvent.pointerMove(handle, touch(2, 250, 300));
    fireEvent.pointerUp(handle, touch(2, 250, 300));
    expect(startLine).toHaveBeenCalledTimes(1);
    expect(compasses().style.transform).toBe("rotate(90deg)");
    off();
  });

  it("snaps the needle onto a point in the ink as it's dragged near, and shows a ring there", () => {
    const { off } = registerPage(null, [300, 300]);
    const { container } = render(<Harness />);
    // The legs carry the needle from (200, 300) to (298, 302), within half a centimetre of the point.
    fireEvent.pointerDown(compasses(), touch(1, 210, 280));
    fireEvent.pointerMove(compasses(), touch(1, 308, 282));
    expect(compasses().style.left).toBe("300px");
    expect(container.querySelector("[data-snapped='needle']")).not.toBeNull();

    // Further away, it lets go and follows the finger again.
    fireEvent.pointerMove(compasses(), touch(1, 330, 282));
    expect(compasses().style.left).toBe("320px");
    expect(container.querySelector("[data-snapped]")).toBeNull();
    fireEvent.pointerUp(compasses(), touch(1, 330, 282));
    off();
  });

  it("snaps the pencil onto a point, opening to exactly that length", () => {
    const { off } = registerPage(null, [262, 305]);
    const { container } = render(<Harness />);
    const grip = screen.getByRole("img", { name: "Drag to open or close" });
    fireEvent.pointerDown(grip, touch(1, 235, 280));
    // The pencil follows the finger to (263, 304), a pixel or so from the point.
    fireEvent.pointerMove(grip, touch(1, 258, 284));
    expect(parseFloat(compasses().style.width)).toBeCloseTo(Math.hypot(62, 5));
    expect(screen.getByText("6.2 cm")).toBeInTheDocument();
    expect(container.querySelector("[data-snapped='pencil']")).not.toBeNull();
    fireEvent.pointerUp(grip, touch(1, 258, 284));
    off();
  });

  it("keeps every part of the circle the pencil has passed over, going back and on past the start", () => {
    const line: DrivenLine = { to: vi.fn(), end: vi.fn() };
    const { off } = registerPage(line);
    render(<Harness />);
    const handle = screen.getByRole("img", { name: "Turn to draw" });

    // A quarter turn one way, back to the start, then an eighth of a turn on past it the other way.
    fireEvent.pointerDown(handle, touch(1, 200, 250));
    fireEvent.pointerMove(handle, touch(1, 250, 300));
    fireEvent.pointerMove(handle, touch(1, 200, 250));
    fireEvent.pointerMove(handle, touch(1, 200 - 50 * Math.SQRT1_2, 300 - 50 * Math.SQRT1_2));
    const arc = vi.mocked(line.to).mock.lastCall![0];
    expect(arc).toHaveLength(136);
    expect(arc[0][0]).toBeCloseTo(200 + 40 * Math.SQRT1_2);
    expect(arc[0][1]).toBeCloseTo(300 - 40 * Math.SQRT1_2);
    expect(arc[135][0]).toBeCloseTo(200);
    expect(arc[135][1]).toBeCloseTo(340);
    fireEvent.pointerUp(handle, touch(1, 164, 264));
    off();
  });

  it("stands the right way up again, mirrored, once a turn leaves the pencil left of the needle", () => {
    render(<Harness />);
    const handle = screen.getByRole("img", { name: "Turn to draw" });
    fireEvent.pointerDown(handle, touch(1, 200, 250));
    fireEvent.pointerMove(handle, touch(1, 250, 300));
    fireEvent.pointerMove(handle, touch(1, 200, 350));
    // Part way through the turn, the handle stays where the finger has it.
    expect(compasses().style.transform).toBe("rotate(180deg)");
    fireEvent.pointerUp(handle, touch(1, 200, 350));

    expect(compasses().style.transform).toBe("rotate(180deg) scaleY(-1)");
    // The X turns back against them, so it still reads as an X.
    const x = screen.getByRole("button", { name: "Hide the compasses" }).querySelector("svg")!;
    expect(x.style.transform).toBe("scaleY(-1) rotate(-180deg)");
  });

  it("flips the pencil to the other side of the needle without drawing", () => {
    const line: DrivenLine = { to: vi.fn(), end: vi.fn() };
    const { startLine, off } = registerPage(line);
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Flip to the other side" }));

    expect(compasses().style.transform).toBe("rotate(180deg) scaleY(-1)");
    expect(compasses().style.left).toBe("200px");
    expect(startLine).not.toHaveBeenCalled();
    off();
  });
});
