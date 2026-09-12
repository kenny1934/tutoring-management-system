import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { lessonKeyAction, lessonShortcuts, useLessonKeys, type LessonKeyEvent, type LessonKeyState } from "./useLessonKeys";

/** Nothing open, and the Hand picked. */
const calm: LessonKeyState = {
  blocked: false, wolframOpen: false, printMenuOpen: false, helpOpen: false, drawing: false, focusMode: false,
};

const key = (k: string, init: Partial<LessonKeyEvent> = {}): LessonKeyEvent => ({
  key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, target: null, ...init,
});

describe("lessonKeyAction", () => {
  it.each([
    ["j", "next"],
    ["ArrowDown", "next"],
    ["k", "previous"],
    ["ArrowUp", "previous"],
    ["Tab", "nextStudent"],
    ["d", "pen"],
    ["e", "eraser"],
    ["+", "zoomIn"],
    ["=", "zoomIn"],
    ["-", "zoomOut"],
    ["z", "undo"],
    ["Z", "redo"],
    ["c", "editClasswork"],
    ["h", "editHomework"],
    ["H", "homeworkBlock"],
    ["p", "print"],
    ["a", "answerKey"],
    ["s", "save"],
    ["f", "toggleFocus"],
    ["w", "toggleWolfram"],
    ["?", "toggleHelp"],
    ["Escape", "exit"],
  ])("reads %s as %s", (k, action) => {
    expect(lessonKeyAction(key(k), calm)).toBe(action);
  });

  it("reads Shift+Tab as the previous student, and Shift+z as redo", () => {
    expect(lessonKeyAction(key("Tab", { shiftKey: true }), calm)).toBe("previousStudent");
    expect(lessonKeyAction(key("z", { shiftKey: true }), calm)).toBe("redo");
  });

  it("leaves every other key alone", () => {
    for (const k of ["x", "Enter", " "]) expect(lessonKeyAction(key(k), calm)).toBeNull();
  });

  it("leaves + and - held with Ctrl, Cmd or Alt to the browser's own page zoom", () => {
    expect(lessonKeyAction(key("+", { ctrlKey: true }), calm)).toBeNull();
    expect(lessonKeyAction(key("-", { metaKey: true }), calm)).toBeNull();
    expect(lessonKeyAction(key("=", { altKey: true }), calm)).toBeNull();
  });

  it("closes the nearest thing with Escape: Wolfram, the print menu, the help, the pen, then focus mode", () => {
    const everything = { ...calm, wolframOpen: true, printMenuOpen: true, helpOpen: true, drawing: true, focusMode: true };
    expect(lessonKeyAction(key("Escape"), everything)).toBe("closeWolfram");
    expect(lessonKeyAction(key("Escape"), { ...everything, wolframOpen: false })).toBe("closePrintMenu");
    expect(lessonKeyAction(key("Escape"), { ...calm, helpOpen: true, drawing: true, focusMode: true })).toBe("closeHelp");
    expect(lessonKeyAction(key("Escape"), { ...calm, drawing: true, focusMode: true })).toBe("selectHand");
    expect(lessonKeyAction(key("Escape"), { ...calm, focusMode: true })).toBe("exitFocus");
  });

  it("ignores every key while a dialog is open", () => {
    const blocked = { ...calm, blocked: true };
    for (const k of ["j", "z", "Escape", "c", "+"]) expect(lessonKeyAction(key(k), blocked)).toBeNull();
  });

  it("lets only Escape through while Wolfram is open", () => {
    const wolfram = { ...calm, wolframOpen: true };
    expect(lessonKeyAction(key("j"), wolfram)).toBeNull();
    expect(lessonKeyAction(key("z"), wolfram)).toBeNull();
    expect(lessonKeyAction(key("Escape"), wolfram)).toBe("closeWolfram");
  });

  it("leaves keys held with Ctrl, Cmd or Alt to the browser, apart from undo", () => {
    expect(lessonKeyAction(key("c", { ctrlKey: true }), calm)).toBeNull();
    expect(lessonKeyAction(key("j", { metaKey: true }), calm)).toBeNull();
    expect(lessonKeyAction(key("w", { altKey: true }), calm)).toBeNull();
    expect(lessonKeyAction(key("Escape", { ctrlKey: true }), calm)).toBeNull();
    expect(lessonKeyAction(key("z", { ctrlKey: true }), calm)).toBe("undo");
  });

  it("leaves keys typed into a text box to the text", () => {
    for (const tag of ["input", "textarea", "select"] as const) {
      expect(lessonKeyAction(key("j", { target: document.createElement(tag) }), calm)).toBeNull();
    }
    expect(lessonKeyAction(key("j", { target: document.createElement("div") }), calm)).toBe("next");
  });
});

describe("lessonShortcuts", () => {
  const keys = (view: Parameters<typeof lessonShortcuts>[0]) => lessonShortcuts(view).map(([k]) => k);

  it("lists Tab only for the multi-student view and H only for the one-student view", () => {
    expect(keys("multi-student")).toContain("Tab");
    expect(keys("multi-student")).not.toContain("H");
    expect(keys("one-student")).toContain("H");
    expect(keys("one-student")).not.toContain("Tab");
  });

  it("says Escape leaves only the one-student view", () => {
    const escape = (view: Parameters<typeof lessonShortcuts>[0]) => lessonShortcuts(view).find(([k]) => k === "Esc")?.[1];
    expect(escape("one-student")).toBe("Exit / Back");
    expect(escape("multi-student")).toBe("Back");
  });
});

describe("useLessonKeys", () => {
  const pressOnWindow = (k: string) => {
    const event = new KeyboardEvent("keydown", { key: k, cancelable: true });
    window.dispatchEvent(event);
    return event;
  };

  it("runs the view's handler for a key, and claims the key from the browser", () => {
    const next = vi.fn();
    renderHook(() => useLessonKeys(calm, { next }));
    expect(pressOnWindow("j").defaultPrevented).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("leaves a key to the browser while the view can't act on it", () => {
    renderHook(() => useLessonKeys(calm, { next: vi.fn() }));
    expect(pressOnWindow("Tab").defaultPrevented).toBe(false);
    expect(pressOnWindow("Escape").defaultPrevented).toBe(false);
    expect(pressOnWindow("x").defaultPrevented).toBe(false);
  });

  it("reads the newest state and handlers on every key", () => {
    const exit = vi.fn();
    const selectHand = vi.fn();
    const { rerender } = renderHook(
      ({ drawing }) => useLessonKeys({ ...calm, drawing }, { exit, selectHand: drawing ? selectHand : undefined }),
      { initialProps: { drawing: true } },
    );
    pressOnWindow("Escape");
    expect(selectHand).toHaveBeenCalledTimes(1);

    rerender({ drawing: false });
    pressOnWindow("Escape");
    expect(exit).toHaveBeenCalledTimes(1);
    expect(selectHand).toHaveBeenCalledTimes(1);
  });

  it("stops listening once the view has gone", () => {
    const next = vi.fn();
    const { unmount } = renderHook(() => useLessonKeys(calm, { next }));
    unmount();
    pressOnWindow("j");
    expect(next).not.toHaveBeenCalled();
  });
});
