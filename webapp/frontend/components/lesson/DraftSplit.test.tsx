import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DraftSplit } from "./DraftSplit";

// jsdom lays nothing out, so every element is a row 1000 pixels wide at the screen's left edge.
const originalRect = Element.prototype.getBoundingClientRect;
beforeAll(() => {
  Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = originalRect;
});
beforeEach(() => localStorage.clear());

function renderSplit() {
  render(
    <div>
      <DraftSplit>
        <section aria-label="Draft" />
      </DraftSplit>
    </div>,
  );
}

const border = () => screen.getByRole("separator", { name: "Drag to resize the Draft" });
const drag = (from: number, to: number) => {
  fireEvent.pointerDown(border(), { pointerId: 1, clientX: from });
  fireEvent.pointerMove(border(), { pointerId: 1, clientX: to });
};

describe("DraftSplit", () => {
  it("starts even, and gives the Draft the room the border is dragged to once the finger lifts", () => {
    renderSplit();
    expect(border()).toHaveAttribute("aria-valuenow", "50");

    drag(500, 300);
    // While the finger is down, only the line follows it.
    expect(border()).toHaveAttribute("aria-valuenow", "50");
    fireEvent.pointerUp(border(), { pointerId: 1, clientX: 300 });

    expect(border()).toHaveAttribute("aria-valuenow", "70");
    expect(localStorage.getItem("csm_draft_share")).toBe("0.7");
  });

  it("keeps each side at least 240 pixels wide", () => {
    renderSplit();
    drag(500, 10);
    fireEvent.pointerUp(border(), { pointerId: 1, clientX: 10 });
    expect(border()).toHaveAttribute("aria-valuenow", "76");
  });

  it("remembers how this board last shared the space", () => {
    localStorage.setItem("csm_draft_share", "0.65");
    renderSplit();
    expect(border()).toHaveAttribute("aria-valuenow", "65");
  });

  it("moves with the arrow keys, Left giving the Draft more room", () => {
    renderSplit();
    fireEvent.keyDown(border(), { key: "ArrowLeft" });
    expect(border()).toHaveAttribute("aria-valuenow", "55");
  });
});
