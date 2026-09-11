import { describe, it, expect } from "vitest";
import { inkHistoryKey, printErrorMessage } from "./lesson-utils";

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

describe("printErrorMessage", () => {
  it("gives the popup advice only when a popup was blocked", () => {
    expect(printErrorMessage("popup_blocked")).toBe("Print failed. Check popup blocker settings.");
    expect(printErrorMessage("file_not_found")).toBe("Couldn't load the file for printing");
  });
});
