import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLessonEscape } from "./useLessonEscape";

const press = (key: string) => document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

describe("useLessonEscape", () => {
  const lesson = vi.fn();
  window.addEventListener("keydown", lesson);
  afterEach(() => lesson.mockReset());

  it("takes Escape while open, before the lesson's own keys hear it", () => {
    const onEscape = vi.fn();
    renderHook(() => useLessonEscape(true, onEscape));
    press("Escape");
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(lesson).not.toHaveBeenCalled();

    // Every other key still reaches the lesson.
    press("p");
    expect(lesson).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape to the lesson while closed", () => {
    const onEscape = vi.fn();
    renderHook(() => useLessonEscape(false, onEscape));
    press("Escape");
    expect(onEscape).not.toHaveBeenCalled();
    expect(lesson).toHaveBeenCalledTimes(1);
  });
});
