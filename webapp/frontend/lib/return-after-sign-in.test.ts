import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasReturnPath, isSafeReturnPath, rememberReturnPath, takeReturnPath } from "./return-after-sign-in";

describe("returning to the page after signing in", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("comes back to the page someone was on, once", () => {
    rememberReturnPath("/sessions?date=2026-10-12");
    expect(hasReturnPath()).toBe(true);
    expect(takeReturnPath()).toBe("/sessions?date=2026-10-12");
    expect(takeReturnPath()).toBeNull();
  });

  it("forgets the page after 15 minutes", () => {
    vi.useFakeTimers();
    rememberReturnPath("/students/12");
    vi.advanceTimersByTime(16 * 60 * 1000);
    expect(takeReturnPath()).toBeNull();
  });

  it("never goes anywhere outside CSM", () => {
    for (const path of ["https://evil.example", "//evil.example", "/\\evil.example", "evil", "/login?x=1"]) {
      expect(isSafeReturnPath(path)).toBe(false);
      rememberReturnPath(path);
      expect(takeReturnPath()).toBeNull();
    }
  });

  it("ignores a note someone has tampered with", () => {
    localStorage.setItem("csm-return-after-sign-in", JSON.stringify({ path: "//evil.example", at: Date.now() }));
    expect(takeReturnPath()).toBeNull();
  });
});
