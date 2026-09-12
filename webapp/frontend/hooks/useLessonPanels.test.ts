import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLessonPanels } from "./useLessonPanels";

describe("useLessonPanels", () => {
  it("starts with everything shut", () => {
    const { result } = renderHook(() => useLessonPanels());
    expect(result.current.keyState).toEqual({ wolframOpen: false, printMenuOpen: false, helpOpen: false });
  });

  it("opens and closes Wolfram and the help, and tells the key table", () => {
    const { result } = renderHook(() => useLessonPanels());
    act(() => result.current.keyHandlers.toggleWolfram());
    act(() => result.current.keyHandlers.toggleHelp());
    expect(result.current.keyState).toEqual({ wolframOpen: true, printMenuOpen: false, helpOpen: true });

    act(() => result.current.keyHandlers.closeWolfram());
    act(() => result.current.toggleHelp());
    expect(result.current.wolframOpen).toBe(false);
    expect(result.current.helpOpen).toBe(false);
  });

  it("lets the header open the print menu and a key close it", () => {
    const { result } = renderHook(() => useLessonPanels());
    act(() => result.current.setPrintMenuOpen(true));
    expect(result.current.keyState.printMenuOpen).toBe(true);
    act(() => result.current.keyHandlers.closePrintMenu());
    expect(result.current.printMenuOpen).toBe(false);
  });

  it("keeps its functions the same between renders", () => {
    const { result, rerender } = renderHook(() => useLessonPanels());
    const first = result.current;
    rerender();
    expect(result.current.keyHandlers).toEqual(first.keyHandlers);
    expect(result.current.setPrintMenuOpen).toBe(first.setPrintMenuOpen);
  });
});
