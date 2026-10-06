import { describe, it, expect, beforeEach } from "vitest";
import { SHAPE_BOOT_SCRIPT, applyShape } from "./shape";

function bootAt(path: string) {
  window.history.pushState({}, "", path);
  new Function(SHAPE_BOOT_SCRIPT)();
}

beforeEach(() => {
  delete document.documentElement.dataset.shape;
});

describe("SHAPE_BOOT_SCRIPT", () => {
  it("gives the public summer and regular pages their classic shape", () => {
    bootAt("/summer/apply");
    expect(document.documentElement.dataset.shape).toBe("classic");
    delete document.documentElement.dataset.shape;
    bootAt("/regular");
    expect(document.documentElement.dataset.shape).toBe("classic");
  });

  it("leaves CSM's own pages on the Ledger shape", () => {
    bootAt("/sessions");
    expect(document.documentElement.dataset.shape).toBeUndefined();
    // A staff page whose name only starts like a public one is still staff.
    bootAt("/summertime");
    expect(document.documentElement.dataset.shape).toBeUndefined();
    bootAt("/admin/summer/arrangement");
    expect(document.documentElement.dataset.shape).toBeUndefined();
  });
});

describe("applyShape", () => {
  it("sets and clears the classic shape as someone moves between pages", () => {
    applyShape(true);
    expect(document.documentElement.dataset.shape).toBe("classic");
    applyShape(false);
    expect(document.documentElement.dataset.shape).toBeUndefined();
  });
});
