import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement, useRef } from "react";
import { useViewerTouch } from "./useViewerTouch";

// A scroller holding a drawing layer, a bare margin beside it, a touch owner, and a layer that takes one finger.
function Harness({ handTool = false, onLayer, onOwner }: { handTool?: boolean; onLayer?: () => void; onOwner?: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { gestureActive, handlers } = useViewerTouch({
    scrollRef,
    getAnchor: () => null,
    handTool,
    zoom: 100,
    minZoom: 25,
    maxZoom: 200,
    previewZoom: () => {},
    commitZoom: () => {},
  });
  return createElement("div", { ref: scrollRef, ...handlers },
    createElement("div", { "data-annotation-layer": "", "data-testid": "layer", onPointerDown: onLayer }),
    createElement("div", { "data-testid": "margin" }),
    createElement("div", { "data-touch-owner": "", onPointerDown: onOwner },
      createElement("span", { "data-testid": "owner" }),
    ),
    createElement("div", { "data-takes-one-finger": "", "data-testid": "placer" }),
    createElement("textarea", { "data-testid": "text", "aria-label": "Text" }),
    createElement("math-field", { "data-testid": "maths" }),
    createElement("p", null, gestureActive ? "Two fingers" : "One finger"),
  );
}

// Starting a pan is the only thing in the harness that captures a pointer, so
// a call here means the viewer began to scroll with that finger.
const capture = vi.fn();
const original = HTMLElement.prototype.setPointerCapture;
beforeEach(() => {
  capture.mockReset();
  HTMLElement.prototype.setPointerCapture = capture;
});
afterEach(() => {
  if (original) HTMLElement.prototype.setPointerCapture = original;
  else delete (HTMLElement.prototype as { setPointerCapture?: unknown }).setPointerCapture;
});

const finger = (id: number) => ({ pointerId: id, pointerType: "touch", isPrimary: id === 1, clientX: 10 * id, clientY: 10 });

describe("useViewerTouch", () => {
  it("never opens the right-click menu on the page, so a finger held still keeps its dot, but leaves a text box and a maths field their menus", () => {
    render(createElement(Harness));
    // fireEvent says false when the event's default, here the menu, was stopped.
    expect(fireEvent.contextMenu(screen.getByTestId("layer"))).toBe(false);
    expect(fireEvent.contextMenu(screen.getByTestId("margin"))).toBe(false);
    expect(fireEvent.contextMenu(screen.getByTestId("text"))).toBe(true);
    expect(fireEvent.contextMenu(screen.getByTestId("maths"))).toBe(true);
  });

  it("scrolls with a finger that lands beside the pages", () => {
    render(createElement(Harness));
    fireEvent.pointerDown(screen.getByTestId("margin"), finger(1));
    expect(capture).toHaveBeenCalledWith(1);
  });

  it("leaves a finger that lands on a touch owner to the owner", () => {
    const onOwner = vi.fn();
    render(createElement(Harness, { onOwner }));
    fireEvent.pointerDown(screen.getByTestId("owner"), finger(1));
    expect(capture).not.toHaveBeenCalled();
    expect(onOwner).toHaveBeenCalledTimes(1);
  });

  it("doesn't count a touch owner's finger towards a two-finger gesture", () => {
    const onLayer = vi.fn();
    render(createElement(Harness, { onLayer }));
    fireEvent.pointerDown(screen.getByTestId("owner"), finger(1));
    fireEvent.pointerDown(screen.getByTestId("layer"), finger(2));
    expect(screen.getByText("One finger")).toBeInTheDocument();
    // The second finger reaches the drawing layer as an ordinary touch.
    expect(onLayer).toHaveBeenCalledTimes(1);
  });

  it("still turns two ordinary fingers into a gesture", () => {
    const onLayer = vi.fn();
    render(createElement(Harness, { onLayer }));
    fireEvent.pointerDown(screen.getByTestId("layer"), finger(1));
    fireEvent.pointerDown(screen.getByTestId("layer"), finger(2));
    expect(screen.getByText("Two fingers")).toBeInTheDocument();
    // The second finger is kept away from the drawing layer.
    expect(onLayer).toHaveBeenCalledTimes(1);
  });

  it("never pans with a finger or the mouse on a layer that takes one finger, even with the Hand picked", () => {
    render(createElement(Harness, { handTool: true }));
    fireEvent.pointerDown(screen.getByTestId("placer"), finger(1));
    fireEvent.pointerDown(screen.getByTestId("placer"), { pointerId: 3, pointerType: "mouse", button: 0 });
    expect(capture).not.toHaveBeenCalled();
  });

  it("still turns two fingers on a layer that takes one finger into a gesture", () => {
    render(createElement(Harness));
    fireEvent.pointerDown(screen.getByTestId("placer"), finger(1));
    fireEvent.pointerDown(screen.getByTestId("placer"), finger(2));
    expect(screen.getByText("Two fingers")).toBeInTheDocument();
  });

  it("doesn't start the Hand's mouse drag on a touch owner", () => {
    render(createElement(Harness, { handTool: true }));
    const mouse = { pointerId: 1, pointerType: "mouse", button: 0 };
    fireEvent.pointerDown(screen.getByTestId("owner"), mouse);
    expect(capture).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByTestId("margin"), mouse);
    expect(capture).toHaveBeenCalledWith(1);
  });
});
