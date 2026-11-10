import { afterEach, describe, expect, it, vi } from "vitest";
import { animateLessonArrival, animateLessonFocus, lessonHref } from "./lessonJourney";

afterEach(() => vi.restoreAllMocks());
describe("lesson preview journey", () => {
  it("preserves actual lesson intent and strips retired preview flags", () => {
    const href = "/sessions/lesson?date=2026-11-05&slot=16%3A45&tutor_id=4&ui-preview=original";
    const lesson = new URL(lessonHref(href, 10), "https://csm.invalid");
    expect(lesson.searchParams.get("date")).toBe("2026-11-05");
    expect(lesson.searchParams.has("ui-preview")).toBe(false);
    expect(lesson.searchParams.get("lesson_session")).toBe("10");
    expect(lessonHref("/sessions/10?lesson=true#worksheet")).toBe("/sessions/10?lesson=true#worksheet");
  });
  it("animates the same surface without locking it or changing its scroll", () => {
    const stage = document.createElement("div"), viewer = document.createElement("div");
    stage.append(viewer); viewer.scrollTop = 120;
    const cancel = vi.fn();
    stage.animate = vi.fn().mockReturnValue({ cancel });
    viewer.animate = vi.fn().mockReturnValue({ cancel });
    vi.spyOn(viewer, "getBoundingClientRect").mockReturnValue({ left: 8, top: 8 } as DOMRect);
    const stopArrival = animateLessonArrival(stage);
    const stopFocus = animateLessonFocus(viewer, { left: 336, top: 68 });
    expect(viewer.animate).toHaveBeenCalledWith([{ translate: "328px 60px" }, { translate: "0 0" }], expect.objectContaining({ duration: 240 }));
    expect(viewer.scrollTop).toBe(120);
    expect(stage.inert).not.toBe(true);
    stopArrival(); stopFocus();
    expect(cancel).toHaveBeenCalledTimes(2);
  });
  it("bypasses both animations under reduced motion", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    const stage = document.createElement("div"); stage.animate = vi.fn();
    animateLessonArrival(stage)(); animateLessonFocus(stage, { left: 100, top: 100 })();
    expect(stage.animate).not.toHaveBeenCalled();
  });
});
