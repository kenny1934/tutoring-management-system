import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PageCover } from "./PageCover";

// The page is 1000px tall on screen, so each pixel is a thousandth of it.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    { top: 0, left: 0, right: 700, bottom: 1000, width: 700, height: 1000, x: 0, y: 0, toJSON: () => ({}) } as DOMRect,
  );
});
afterEach(() => vi.restoreAllMocks());

function renderCover(props: Partial<Parameters<typeof PageCover>[0]> = {}) {
  const onMove = vi.fn();
  const onRemove = vi.fn();
  const { container } = render(<PageCover top={0.4} onMove={onMove} onRemove={onRemove} scale={1} darkMode={false} {...props} />);
  return {
    onMove,
    onRemove,
    cover: container.querySelector("[data-page-cover]") as HTMLElement,
    grip: screen.getByRole("slider"),
  };
}

const touch = (clientY: number) => ({ pointerId: 1, pointerType: "touch", clientY });

describe("PageCover", () => {
  it("covers the page from its edge down", () => {
    const { cover, grip } = renderCover();
    expect(cover.style.top).toBe("40%");
    expect(grip).toHaveAttribute("aria-valuenow", "40");
  });

  it("follows the finger while dragging, and reports where the edge ended up when it lifts", () => {
    const { onMove, cover, grip } = renderCover();
    fireEvent.pointerDown(grip, touch(400));
    fireEvent.pointerMove(grip, touch(600));
    expect(cover.style.top).toBe("60%");
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.pointerUp(grip, touch(600));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0][0]).toBeCloseTo(0.6);
  });

  it("keeps the tab on the page", () => {
    const { onMove, grip } = renderCover();
    fireEvent.pointerDown(grip, touch(400));
    fireEvent.pointerMove(grip, touch(2000));
    fireEvent.pointerUp(grip, touch(2000));
    expect(onMove.mock.calls[0][0]).toBeCloseTo(1 - 52 / 1000);
  });

  it("reports nothing for a tap that doesn't move the edge", () => {
    const { onMove, grip } = renderCover();
    fireEvent.pointerDown(grip, touch(400));
    fireEvent.pointerUp(grip, touch(400));
    expect(onMove).not.toHaveBeenCalled();
  });

  it("moves with the arrow keys, which don't reach the lesson's own keys", () => {
    const lessonKeys = vi.fn();
    window.addEventListener("keydown", lessonKeys);
    const { onMove, grip } = renderCover();
    fireEvent.keyDown(grip, { key: "ArrowDown" });
    window.removeEventListener("keydown", lessonKeys);
    expect(onMove.mock.calls[0][0]).toBeCloseTo(0.45);
    expect(lessonKeys).not.toHaveBeenCalled();
  });

  it("comes off from the X on its tab", () => {
    const { onRemove } = renderCover();
    fireEvent.click(screen.getByRole("button", { name: "Remove the cover" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("keeps its tab to itself, but lets a finger on its body scroll the worksheet", () => {
    const { cover, grip } = renderCover();
    expect(grip.closest("[data-touch-owner]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove the cover" }).closest("[data-touch-owner]")).not.toBeNull();
    expect(cover.closest("[data-touch-owner]")).toBeNull();
  });

  it("keeps the tab the same size at any zoom", () => {
    const { grip } = renderCover({ scale: 2 });
    expect(grip.parentElement!.style.transform).toContain("scale(0.5)");
  });

  it("darkens with the page in Dark PDF", () => {
    const { cover } = renderCover({ darkMode: true });
    expect(cover.style.filter).not.toBe("");
  });
});
