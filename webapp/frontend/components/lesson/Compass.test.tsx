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

/** A page that takes the whole screen, whose drawing layer hands back this line, or none. */
function registerPage(line: DrivenLine | null) {
  const startLine = vi.fn(() => line);
  const page: InkPage = {
    index: 0, label: "Page 1", width: 1000, height: 1000, onPagesChange: () => {}, strokes: () => [], receive: () => {},
    contains: () => true, startLine,
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
});
