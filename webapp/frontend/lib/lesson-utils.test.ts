import { describe, it, expect } from "vitest";
import type { SessionExercise } from "@/types";
import {
  hasBrowserModifier, inkHistoryKey, inkLocation, isTypingTarget, loopStep, printErrorMessage, replacedInkMessage,
} from "./lesson-utils";

describe("replacedInkMessage", () => {
  it("names who changed a page", () => {
    expect(replacedInkMessage([2], "Ms Chan", false))
      .toBe("Ms Chan changed page 3 of this worksheet, so it now shows their version.");
  });

  it("says when the change came from another tab of your own", () => {
    expect(replacedInkMessage([2], "Me", true))
      .toBe("Page 3 was changed in another tab, so it now shows that version.");
  });

  it("lists several pages in order, and names Draft sheets", () => {
    expect(replacedInkMessage([3, 2, 1000], "Ms Chan", false))
      .toBe("Ms Chan changed pages 3 and 4 of this worksheet and Draft sheet 1, so they now show their version.");
  });

  it("says another tutor when nobody's name is known", () => {
    expect(replacedInkMessage([0], null, false))
      .toBe("Another tutor changed page 1 of this worksheet, so it now shows their version.");
  });
});

describe("inkLocation", () => {
  it("saves an exercise under its own lesson, with the PDF pages it shows", () => {
    const exercise = {
      id: 5, session_id: 100, exercise_type: "CW", pdf_name: "A.pdf", page_start: 3, page_end: 5, created_by: "x",
    } as SessionExercise;
    expect(inkLocation(exercise)).toEqual({ sessionId: 100, pdfName: "A.pdf", pdfPages: [3, 4, 5] });
  });
});

describe("loopStep", () => {
  it("steps either way and goes round at both ends", () => {
    expect(loopStep(1, 4, 1)).toBe(2);
    expect(loopStep(3, 4, 1)).toBe(0);
    expect(loopStep(0, 4, -1)).toBe(3);
  });

  it("goes to the first or the last from outside the list", () => {
    expect(loopStep(-1, 4, 1)).toBe(0);
    expect(loopStep(-1, 4, -1)).toBe(3);
    expect(loopStep(-1, 1, 1)).toBe(0);
  });

  it("has nowhere to go with one item, or none", () => {
    expect(loopStep(0, 1, 1)).toBeNull();
    expect(loopStep(-1, 0, 1)).toBeNull();
  });
});

describe("inkHistoryKey", () => {
  it("undoes on z", () => {
    expect(inkHistoryKey({ key: "z", shiftKey: false })).toBe("undo");
  });

  it("redoes on Shift+Z, which the browser reports as a capital Z", () => {
    expect(inkHistoryKey({ key: "Z", shiftKey: true })).toBe("redo");
  });

  it("still redoes if a browser reports Shift+Z as a small z with Shift held", () => {
    expect(inkHistoryKey({ key: "z", shiftKey: true })).toBe("redo");
  });

  it("leaves every other key alone", () => {
    expect(inkHistoryKey({ key: "a", shiftKey: false })).toBeNull();
    expect(inkHistoryKey({ key: "Escape", shiftKey: false })).toBeNull();
  });
});

describe("hasBrowserModifier", () => {
  it("is true with Ctrl, Cmd or Alt held, so Ctrl+C is left to the browser", () => {
    expect(hasBrowserModifier({ ctrlKey: true, metaKey: false, altKey: false })).toBe(true);
    expect(hasBrowserModifier({ ctrlKey: false, metaKey: true, altKey: false })).toBe(true);
    expect(hasBrowserModifier({ ctrlKey: false, metaKey: false, altKey: true })).toBe(true);
  });

  it("is false for a plain key", () => {
    expect(hasBrowserModifier({ ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
  });
});

describe("isTypingTarget", () => {
  it("is true for a text box, a text area and a dropdown", () => {
    for (const tag of ["input", "textarea", "select"] as const) {
      expect(isTypingTarget(document.createElement(tag))).toBe(true);
    }
  });

  it("is true for a maths field, which is the target of every key typed in it", () => {
    expect(isTypingTarget(document.createElement("math-field"))).toBe(true);
  });

  it("is false for anything else, or for no target at all", () => {
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("printErrorMessage", () => {
  it("gives the popup advice only when a popup was blocked", () => {
    expect(printErrorMessage("popup_blocked")).toBe("Print failed. Check popup blocker settings.");
    expect(printErrorMessage("file_not_found")).toBe("Couldn't load the file for printing");
  });
});
