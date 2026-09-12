import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Session } from "@/types";
import { useExerciseEditor } from "./useExerciseEditor";

const chan = { id: 100, student_name: "Chan Tai Man" } as Session;

describe("useExerciseEditor", () => {
  it("opens the editor for one lesson's classwork or homework", () => {
    const { result } = renderHook(() => useExerciseEditor(vi.fn()));
    expect(result.current.editing).toBeNull();
    act(() => result.current.openEditor(chan, "HW"));
    expect(result.current.editing).toEqual({ session: chan, type: "HW" });
  });

  it("closes it and asks the view to fetch its lessons again", () => {
    const refresh = vi.fn();
    const { result } = renderHook(() => useExerciseEditor(refresh));
    act(() => result.current.openEditor(chan, "CW"));
    act(() => result.current.closeEditor());
    expect(result.current.editing).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps its functions the same between renders", () => {
    const refresh = vi.fn();
    const { result, rerender } = renderHook(() => useExerciseEditor(refresh));
    const first = result.current;
    rerender();
    expect(result.current.openEditor).toBe(first.openEditor);
    expect(result.current.closeEditor).toBe(first.closeEditor);
  });
});
