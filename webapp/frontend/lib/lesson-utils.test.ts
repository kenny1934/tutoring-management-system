import { describe, it, expect } from "vitest";
import { hasBrowserModifier, inkHistoryKey, loopStep, printErrorMessage } from "./lesson-utils";

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

describe("printErrorMessage", () => {
  it("gives the popup advice only when a popup was blocked", () => {
    expect(printErrorMessage("popup_blocked")).toBe("Print failed. Check popup blocker settings.");
    expect(printErrorMessage("file_not_found")).toBe("Couldn't load the file for printing");
  });
});
