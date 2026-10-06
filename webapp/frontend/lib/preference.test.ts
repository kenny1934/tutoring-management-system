import { describe, it, expect, beforeEach } from "vitest";
import { createChoicePreference } from "./preference";
import { createBooleanPreference } from "./boolean-preference";
import { SURFACE_BOOT_SCRIPT, SURFACE_STORAGE_KEY } from "./surfaces";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.surface;
});

describe("createChoicePreference", () => {
  it("reads as the fallback until something is chosen", () => {
    const pref = createChoicePreference("test_choice_a", ["plain", "wood"] as const, "plain");
    expect(pref.get()).toBe("plain");
  });

  it("keeps a choice and stores it", () => {
    const pref = createChoicePreference("test_choice_b", ["plain", "wood"] as const, "plain");
    pref.set("wood");
    expect(pref.get()).toBe("wood");
    expect(localStorage.getItem("test_choice_b")).toBe("wood");
  });

  it("falls back when storage holds a choice that no longer exists", () => {
    // Someone chose a background that a later version took out.
    localStorage.setItem("test_choice_c", "linen");
    const pref = createChoicePreference("test_choice_c", ["plain", "wood"] as const, "plain");
    expect(pref.get()).toBe("plain");
  });
});

describe("createBooleanPreference", () => {
  it("still reads as false until turned on, and true after", () => {
    const pref = createBooleanPreference("test_bool");
    expect(pref.get()).toBe(false);
    pref.set(true);
    expect(pref.get()).toBe(true);
    expect(localStorage.getItem("test_bool")).toBe("true");
  });
});

describe("SURFACE_BOOT_SCRIPT", () => {
  it("copies a known background onto <html> before React runs", () => {
    localStorage.setItem(SURFACE_STORAGE_KEY, "wood");
    new Function(SURFACE_BOOT_SCRIPT)();
    expect(document.documentElement.dataset.surface).toBe("wood");
  });

  it("leaves <html> alone for an unknown value, so the page stays plain", () => {
    localStorage.setItem(SURFACE_STORAGE_KEY, "<script>");
    new Function(SURFACE_BOOT_SCRIPT)();
    expect(document.documentElement.dataset.surface).toBeUndefined();
  });
});
