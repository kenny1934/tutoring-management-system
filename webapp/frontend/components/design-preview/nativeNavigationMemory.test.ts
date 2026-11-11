import { describe, expect, it } from "vitest";
import { NativeNavigationMemory, nativePageKey, nativeSessionsHref } from "./nativeNavigationMemory";

describe("real Sessions destinations", () => {
  const saved = "/sessions?view=list&date=2026-11-09&tutor=7&status=Scheduled";
  it("returns to the last view from a tab and keeps an explicit dashboard date", () => {
    const tab = new URL(nativeSessionsHref("/sessions", saved), "https://csm.invalid");
    expect(tab.searchParams.get("date")).toBe("2026-11-09");
    expect(tab.searchParams.get("tutor")).toBe("7");
    expect(tab.searchParams.get("ui-preview")).toBeNull();
    const today = new URL(nativeSessionsHref("/sessions?date=2026-11-10", saved), tab);
    expect(today.searchParams.get("date")).toBe("2026-11-10");
    expect(today.searchParams.get("status")).toBe("Scheduled");
    expect(today.searchParams.get("ui-preview")).toBeNull();
  });
  it("preserves special destinations and never turns a dated link into a dateless view", () => {
    const special = "/sessions?filter=pending-makeups&tutor=7&view=list";
    expect(nativeSessionsHref("/sessions?ui-preview=motion", special)).toContain("filter=pending-makeups");
    expect(nativeSessionsHref("/sessions?date=2026-11-10", special)).not.toContain("filter=");
    expect(nativeSessionsHref("/sessions?filter=after-last-day", saved)).not.toContain("date=");
    expect(nativeSessionsHref("/sessions?view=weekly", saved)).not.toContain("status=");
    expect(nativeSessionsHref("/sessions?tutor=&date=2026-11-10", saved)).toContain("tutor=&");
  });
  it("leaves other routes and external destinations untouched", () => {
    for (const href of ["/students", "/sessions/lesson", "https://example.com/sessions"]) {
      expect(nativeSessionsHref(href, saved)).toBe(href);
    }
  });
});

describe("ephemeral navigation memory", () => {
  it("shares equivalent URLs across preview modes without merging distinct filters", () => {
    const key = nativePageKey("/sessions?date=2026-11-09&tutor=&ui-preview=motion");
    expect(key).toBe(nativePageKey("/sessions?ui-preview=original&view=list&date=2026-11-09"));
    expect(key).not.toBe(nativePageKey("/sessions?date=2026-11-09&tutor=7"));
    expect(nativePageKey("/sessions?filter=after-last-day")).toContain("view=weekly");
    expect(nativePageKey("/sessions/lesson?lesson_frame=1&lesson_session=5")).toBe("/sessions/lesson?lesson_session=5");
  });
  it("bounds retained places and choices and separates store instances", () => {
    const memory = new NativeNavigationMemory();
    for (let i = 0; i < 45; i++) {
      memory.set(`choice:${i}`, i);
      memory.setPlace(`/sessions?date=${i}`, { main: i, inner: {} });
    }
    expect(memory.get("choice:0")).toBeUndefined();
    expect(memory.get("choice:44")).toBe(44);
    expect(memory.getPlace("/sessions?date=0")).toBeUndefined();
    expect(new NativeNavigationMemory().get("choice:44")).toBeUndefined();
  });
});
