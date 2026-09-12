import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { SessionExercise } from "@/types";
import { useDraft } from "./useDraft";

type Opened = Pick<SessionExercise, "url" | "pdf_name"> | null;

const worksheet = { pdf_name: "Algebra\\Linear equations 3.pdf" } as Pick<SessionExercise, "url" | "pdf_name">;
const link = { pdf_name: "", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } as Pick<SessionExercise, "url" | "pdf_name">;

describe("useDraft", () => {
  it("opens and closes beside a worksheet on a big screen", () => {
    const { result } = renderHook(() => useDraft(worksheet, false));
    expect(result.current.draftOpen).toBe(false);
    act(() => result.current.toggleDraft());
    expect(result.current.draftOpen).toBe(true);
    act(() => result.current.closeDraft());
    expect(result.current.draftOpen).toBe(false);
  });

  it("stays shut for a link, with nothing open and on a phone, and comes back with a worksheet", () => {
    const { result, rerender } = renderHook(
      ({ exercise, isMobile }: { exercise: Opened; isMobile: boolean }) => useDraft(exercise, isMobile),
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

  it("keeps its functions the same between renders", () => {
    const { result, rerender } = renderHook(() => useDraft(worksheet, false));
    const first = result.current;
    rerender();
    expect(result.current.toggleDraft).toBe(first.toggleDraft);
    expect(result.current.closeDraft).toBe(first.closeDraft);
    expect(result.current.setTrayArea).toBe(first.setTrayArea);
  });
});
