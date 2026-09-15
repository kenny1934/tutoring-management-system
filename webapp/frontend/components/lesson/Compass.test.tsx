import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
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
// Each test starts with no width remembered, so the compasses open to their usual 4 cm.
beforeEach(() => localStorage.clear());

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
 * It snaps within half a centimetre, which is 5 pixels here.
 */
function registerPage(line: DrivenLine | null, point: Vec = [900, 900]) {
  const startLine = vi.fn(() => line);
  const page: InkPage = {
    index: 0, label: "Page 1", width: 1000, height: 1000, onPagesChange: () => {}, strokes: () => [], receive: () => {},
    contains: () => true, startLine,
    snapNear: (at) => (Math.hypot(at[0] - point[0], at[1] - point[1]) <= 5 ? point : null),
  };
  return { startLine, off: registerInkPage("compass-test-page", page) };
}

describe("Compass width reading", () => {
  // A pane whose scroller shows the container from this far down the screen.
  function InPane({ viewTop }: { viewTop: number }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    return (
      <div
        ref={(el) => {
          viewportRef.current = el;
          if (el) {
            el.getBoundingClientRect = () =>
              ({ left: 0, top: viewTop, width: 1000, height: 1000 - viewTop, right: 1000, bottom: 1000, x: 0, y: viewTop, toJSON: () => ({}) }) as DOMRect;
          }
        }}
      >
        <div ref={containerRef}>
          <Compass containerRef={containerRef} viewportRef={viewportRef} cm={10} start={START} darkMode={false} onHide={() => {}} />
        </div>
      </div>
    );
  }
  const rise = hingeHeight(4) * 10;
  const top = (el: HTMLElement) => parseFloat(el.style.top);

  it("sits beyond the handle while there's room for it there", () => {
    render(<InPane viewTop={0} />);
    // The needle is at 300 down, and the width sits 2 cm beyond the hinge.
    expect(top(screen.getByText("4.0 cm"))).toBeCloseTo(300 - rise - 20);
  });

  it("goes below the needle and the pencil when the top of the pane would hide it, and the box to set it opens there too", () => {
    // The pane's top edge is level with the hinge, so the width beyond it is out of view.
    render(<InPane viewTop={300 - rise} />);
    expect(top(screen.getByText("4.0 cm"))).toBeCloseTo(312);

    fireEvent.click(screen.getByText("4.0 cm"));
    expect(top(screen.getByRole("group", { name: "Set the width" }))).toBeCloseTo(312);
  });
});

describe("Compass", () => {
  it("puts its needle where it starts, shows its width, and its X hides it", () => {
    const onHide = vi.fn();
    render(<Harness onHide={onHide} />);
    expect(compasses().style.left).toBe("200px");
    expect(compasses().style.width).toBe("40px");
    expect(screen.getByText("4.0 cm")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide the compasses" }));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("moves by its legs at the same width", () => {
    render(<Harness />);
    fireEvent.pointerDown(compasses(), touch(1, 210, 280));
    fireEvent.pointerMove(compasses(), touch(1, 230, 290));
    fireEvent.pointerUp(compasses(), touch(1, 230, 290));

    expect(compasses().style.left).toBe("220px");
    expect(compasses().style.width).toBe("40px");
    expect(screen.getByText("4.0 cm")).toBeInTheDocument();
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
    // The board remembers the width for the next time the compasses come out.
    expect(localStorage.getItem("csm_compass_width")).toBe("6.1");
  });

  it("comes back at the width this board last left it at", () => {
    localStorage.setItem("csm_compass_width", "7.5");
    render(<Harness />);
    expect(compasses().style.width).toBe("75px");
    expect(screen.getByText("7.5 cm")).toBeInTheDocument();
  });

  it("opens its width out to be set exactly, a millimetre at a time or typed, with the needle kept still", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /^Width 4\.0 cm/ }));
    const box = screen.getByRole("textbox", { name: "Width in centimetres" });
    expect(box).toHaveValue("4.0");

    fireEvent.click(screen.getByRole("button", { name: "A millimetre wider" }));
    expect(box).toHaveValue("4.1");
    expect(compasses().style.left).toBe("200px");
    expect(compasses().style.width).toBe("41px");

    // A typed width is snapped to a millimetre once Enter is pressed, and the box closes.
    fireEvent.change(box, { target: { value: "6.25" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(compasses().style.width).toBe("63px");
    expect(screen.getByText("6.3 cm")).toBeInTheDocument();
    expect(localStorage.getItem("csm_compass_width")).toBe("6.3");
  });

  it("closes the width's box on a tap elsewhere without the page taking that tap, and Escape forgets what was typed", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /^Width/ }));
    const page = vi.fn();
    document.body.addEventListener("pointerdown", page);
    fireEvent.pointerDown(document.body, touch(1, 600, 600));
    expect(page).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    document.body.removeEventListener("pointerdown", page);

    fireEvent.click(screen.getByRole("button", { name: /^Width/ }));
    const box = screen.getByRole("textbox", { name: "Width in centimetres" });
    fireEvent.change(box, { target: { value: "9" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("4.0 cm")).toBeInTheDocument();
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

  it("grows from the handle on the needle's leg with the needle kept still, and remembers the size", () => {
    render(<Harness />);
    // With 7 cm legs opened to 4 cm, the hinge is at (220, 300 - 67.1), and
    // the handle is 24.5 pixels up the needle's leg towards it.
    const hingeRise = hingeHeight(4) * 10;
    const handle = screen.getByRole("img", { name: "Drag to resize" });
    fireEvent.pointerDown(handle, touch(1, 200 + (20 * 24.5) / 70, 300 - (hingeRise * 24.5) / 70));
    // 35 pixels from the needle makes the legs 10 cm.
    fireEvent.pointerMove(handle, touch(1, 200, 265));
    fireEvent.pointerUp(handle, touch(1, 200, 265));

    expect(compasses().style.left).toBe("200px");
    expect(compasses().style.width).toBe("40px");
    expect(parseFloat(compasses().style.height)).toBeCloseTo(hingeHeight(4, 10) * 10 + 15);
    expect(localStorage.getItem("csm_compass_legs")).toBe("10");
  });

  it("closes up to fit legs made too short for the width", () => {
    localStorage.setItem("csm_compass_legs", "10");
    localStorage.setItem("csm_compass_width", "12");
    render(<Harness />);
    expect(screen.getByText("12.0 cm")).toBeInTheDocument();

    // The needle starts 60 pixels left of the start, at (160, 300 + the difference in the hinge's height).
    const needle: Vec = [START[0] - 60, parseFloat(compasses().style.top) + parseFloat(compasses().style.height)];
    // The hinge is at (60, -80) from the needle, and the handle 35 pixels along towards it.
    const handle = screen.getByRole("img", { name: "Drag to resize" });
    fireEvent.pointerDown(handle, touch(1, needle[0] + 21, needle[1] - 28));
    // Half as far from the needle makes the legs 5 cm, which open to 9 cm at most.
    fireEvent.pointerMove(handle, touch(1, needle[0] + 10.5, needle[1] - 14));
    fireEvent.pointerUp(handle, touch(1, needle[0] + 10.5, needle[1] - 14));

    expect(compasses().style.width).toBe("90px");
    expect(screen.getByText("9.0 cm")).toBeInTheDocument();
    expect(localStorage.getItem("csm_compass_legs")).toBe("5");
    expect(localStorage.getItem("csm_compass_width")).toBe("9");
  });

  it("turns without drawing while the pencil is lifted, and draws again once it's put down", () => {
    const line: DrivenLine = { to: vi.fn(), end: vi.fn() };
    const { startLine, off } = registerPage(line);
    const { container } = render(<Harness />);
    const lift = screen.getByRole("button", { name: "Lift the pencil" });
    fireEvent.click(lift);
    expect(lift).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector("[data-pencil='lifted']")).not.toBeNull();

    // A quarter turn with the pencil lifted turns the compasses and draws nothing.
    const turning = screen.getByRole("img", { name: "Turn without drawing" });
    fireEvent.pointerDown(turning, touch(1, 200, 250));
    fireEvent.pointerMove(turning, touch(1, 250, 300));
    fireEvent.pointerUp(turning, touch(1, 250, 300));
    expect(startLine).not.toHaveBeenCalled();
    expect(compasses().style.transform).toBe("rotate(90deg)");

    // Put down again, the next quarter turn draws from where the pencil now is, straight below the needle.
    fireEvent.click(lift);
    expect(lift).toHaveAttribute("aria-pressed", "false");
    const drawing = screen.getByRole("img", { name: "Turn to draw" });
    fireEvent.pointerDown(drawing, touch(2, 250, 300));
    fireEvent.pointerMove(drawing, touch(2, 200, 350));
    fireEvent.pointerUp(drawing, touch(2, 200, 350));
    expect(startLine).toHaveBeenCalledWith([200, 340]);
    off();
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
