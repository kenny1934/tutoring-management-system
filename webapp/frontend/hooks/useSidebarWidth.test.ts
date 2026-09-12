import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, fireEvent } from "@testing-library/react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useSidebarWidth } from "./useSidebarWidth";

const grab = (clientX: number) => ({ clientX, preventDefault: () => {} }) as unknown as ReactMouseEvent;

/** One whole drag of the sidebar's edge, from where the mouse went down to where it let go. */
function drag(startResize: (e: ReactMouseEvent) => void, from: number, to: number) {
  act(() => startResize(grab(from)));
  fireEvent.mouseMove(document, { clientX: to });
  fireEvent.mouseUp(document);
}

beforeEach(() => {
  localStorage.clear();
});

describe("useSidebarWidth", () => {
  it("starts at 320 pixels when nothing has been saved", () => {
    const { result } = renderHook(() => useSidebarWidth());
    expect(result.current.width).toBe(320);
  });

  it("starts from the saved width", () => {
    localStorage.setItem("lesson-sidebar-width", "450");
    const { result } = renderHook(() => useSidebarWidth());
    expect(result.current.width).toBe(450);
  });

  it("ignores a saved width that isn't a number or is out of bounds", () => {
    for (const saved of ["wide", "100", "900"]) {
      localStorage.setItem("lesson-sidebar-width", saved);
      const { result, unmount } = renderHook(() => useSidebarWidth());
      expect(result.current.width).toBe(320);
      unmount();
    }
  });

  it("moves the edge as far as the mouse moved, and saves the width when the drag ends", () => {
    const { result } = renderHook(() => useSidebarWidth());
    drag(result.current.startResize, 400, 480);
    expect(result.current.width).toBe(400);
    expect(localStorage.getItem("lesson-sidebar-width")).toBe("400");
  });

  it("starts each drag from the width the last one left", () => {
    const { result } = renderHook(() => useSidebarWidth());
    drag(result.current.startResize, 400, 450);
    drag(result.current.startResize, 400, 450);
    expect(result.current.width).toBe(420);
  });

  it("keeps the width between 220 and 600 pixels", () => {
    const { result } = renderHook(() => useSidebarWidth());
    drag(result.current.startResize, 400, -1000);
    expect(result.current.width).toBe(220);
    drag(result.current.startResize, 400, 2000);
    expect(result.current.width).toBe(600);
  });

  it("gives the same startResize on every render, so the handle doesn't re-render for nothing", () => {
    const { result, rerender } = renderHook(() => useSidebarWidth());
    const first = result.current.startResize;
    drag(first, 400, 450);
    rerender();
    expect(result.current.startResize).toBe(first);
  });

  it("stops a drag that's still going when the view closes", () => {
    const { result, unmount } = renderHook(() => useSidebarWidth());
    act(() => result.current.startResize(grab(400)));
    expect(document.body.style.cursor).toBe("col-resize");
    unmount();
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });
});
