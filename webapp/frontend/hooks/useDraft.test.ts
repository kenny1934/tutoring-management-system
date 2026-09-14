import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { SessionExercise } from "@/types";
import { lessonDraftId } from "./useAnnotations";
import { useDraft } from "./useDraft";

type Opened = Pick<SessionExercise, "url" | "pdf_name"> | null;

const worksheet = { pdf_name: "Algebra\\Linear equations 3.pdf" } as Pick<SessionExercise, "url" | "pdf_name">;
const link = { pdf_name: "", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } as Pick<SessionExercise, "url" | "pdf_name">;

describe("useDraft", () => {
  it("opens and closes beside a worksheet on a big screen", () => {
    const { result } = renderHook(() => useDraft(worksheet, false, 100));
    expect(result.current.draftOpen).toBe(false);
    act(() => result.current.toggleDraft());
    expect(result.current.draftOpen).toBe(true);
    act(() => result.current.closeDraft());
    expect(result.current.draftOpen).toBe(false);
  });

  it("stays shut for a link, with nothing open and on a phone, and comes back with a worksheet", () => {
    const { result, rerender } = renderHook(
      ({ exercise, isMobile }: { exercise: Opened; isMobile: boolean }) => useDraft(exercise, isMobile, 100),
      { initialProps: { exercise: worksheet as Opened, isMobile: false } },
    );
    act(() => result.current.toggleDraft());

    rerender({ exercise: link, isMobile: false });
    expect(result.current.draftOpen).toBe(false);
    rerender({ exercise: null, isMobile: false });
    expect(result.current.draftOpen).toBe(false);
    rerender({ exercise: worksheet, isMobile: true });
    expect(result.current.draftOpen).toBe(false);

    rerender({ exercise: worksheet, isMobile: false });
    expect(result.current.draftOpen).toBe(true);
  });

  it("hands over the Pen Tray's lane only while the Draft is open", () => {
    const lane = document.createElement("div");
    const { result } = renderHook(() => useDraft(worksheet, false, 100));
    act(() => result.current.setTrayArea(lane));
    expect(result.current.trayArea).toBeUndefined();
    act(() => result.current.toggleDraft());
    expect(result.current.trayArea).toBe(lane);
  });

  it("shows the lesson's own Draft in the exercise's place, and brings the exercise's back when it's put away", () => {
    const { result } = renderHook(() => useDraft(worksheet, false, 100));
    act(() => result.current.toggleDraft());
    act(() => result.current.openLessonDraft());
    expect(result.current.lessonDraftOpen).toBe(true);
    expect(result.current.draftOpen).toBe(false);

    act(() => result.current.closeLessonDraft());
    expect(result.current.lessonDraftOpen).toBe(false);
    expect(result.current.draftOpen).toBe(true);
  });

  it("opens the lesson's own Draft with no exercise open, but never on a phone", () => {
    const { result, rerender } = renderHook(
      ({ isMobile }: { isMobile: boolean }) => useDraft(null, isMobile, 100),
      { initialProps: { isMobile: false } },
    );
    expect(result.current.lessonDraftId).toBe(lessonDraftId(100));
    act(() => result.current.openLessonDraft());
    expect(result.current.lessonDraftOpen).toBe(true);

    rerender({ isMobile: true });
    expect(result.current.lessonDraftId).toBeNull();
    expect(result.current.lessonDraftOpen).toBe(false);
  });

  it("has no lesson draft when there's no lesson to keep one with", () => {
    const { result } = renderHook(() => useDraft(worksheet, false, null));
    act(() => result.current.openLessonDraft());
    expect(result.current.lessonDraftId).toBeNull();
    expect(result.current.lessonDraftOpen).toBe(false);
  });

  it("keeps its functions the same between renders", () => {
    const { result, rerender } = renderHook(() => useDraft(worksheet, false, 100));
    const first = result.current;
    rerender();
    expect(result.current.toggleDraft).toBe(first.toggleDraft);
    expect(result.current.closeDraft).toBe(first.closeDraft);
    expect(result.current.setTrayArea).toBe(first.setTrayArea);
  });
});
