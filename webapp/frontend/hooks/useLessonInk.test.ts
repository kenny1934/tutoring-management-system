import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { SessionExercise } from "@/types";
import { lessonDraftId, type Stroke } from "@/hooks/useAnnotations";

const h = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), saveOnExit: vi.fn(), showToast: vi.fn() }));
vi.mock("@/lib/api", () => ({ lessonInkAPI: { read: h.read, save: h.save, saveOnExit: h.saveOnExit } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { email: "tutor@example.com" } }) }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: h.showToast }) }));

import { useLessonInk } from "./useLessonInk";

function exercise(id: number): SessionExercise {
  return { id, session_id: 100, exercise_type: "CW", pdf_name: `Sheet ${id}.pdf`, page_start: null, page_end: null, remarks: null } as unknown as SessionExercise;
}

const first = exercise(1);
const second = exercise(2);
const stroke = (x: number): Stroke => ({ points: [[x, x, 0.5]], color: "#000000", size: 3 });

function renderInk(open: SessionExercise | null = first, openSource: { name: string } | null = null) {
  return renderHook(
    ({ openExercise, source }) => useLessonInk({
      storageKey: "lesson-ink-test",
      sessionIds: [100],
      exercises: [first, second],
      openExercise,
      openSource: source,
    }),
    { initialProps: { openExercise: open, source: openSource } },
  );
}

beforeEach(() => {
  sessionStorage.clear();
  h.read.mockReset().mockResolvedValue({ pages: [] });
  // Saves never finish here, so whatever is drawn stays waiting to be sent.
  h.save.mockReset().mockImplementation(() => new Promise(() => {}));
  h.saveOnExit.mockReset();
  h.showToast.mockReset();
});

describe("useLessonInk", () => {
  it("draws on the open exercise, and undoes and redoes its strokes in order", async () => {
    const { result } = renderInk();
    await waitFor(() => expect(result.current.inkReady).toBe(true));
    act(() => result.current.onPageStrokesChange(0, [stroke(1)]));
    act(() => result.current.onPageStrokesChange(0, [stroke(1), stroke(2)]));
    expect(result.current.annotations[0]).toHaveLength(2);
    expect(result.current.openHasInk).toBe(true);

    act(() => result.current.onUndo());
    expect(result.current.annotations[0]).toHaveLength(1);
    act(() => result.current.onRedo());
    expect(result.current.annotations[0]).toHaveLength(2);
  });

  it("shows each exercise's own ink when another is opened", async () => {
    const { result, rerender } = renderInk();
    await waitFor(() => expect(result.current.inkReady).toBe(true));
    act(() => result.current.onPageStrokesChange(0, [stroke(1)]));

    rerender({ openExercise: second, source: null });
    expect(result.current.annotations).toEqual({});
    expect(result.current.openHasInk).toBe(false);
    rerender({ openExercise: first, source: null });
    expect(result.current.annotations[0]).toHaveLength(1);
  });

  it("clears one page or all of them, and brings a clear back with undo", async () => {
    const { result } = renderInk();
    await waitFor(() => expect(result.current.inkReady).toBe(true));
    act(() => result.current.onPageStrokesChange(0, [stroke(1)]));
    act(() => result.current.onPageStrokesChange(1, [stroke(2)]));

    act(() => result.current.onClearPage(0));
    expect(result.current.annotations[0]).toEqual([]);
    expect(result.current.annotations[1]).toHaveLength(1);
    act(() => result.current.onClearAll());
    expect(result.current.openHasInk).toBe(false);
    act(() => result.current.onUndo());
    expect(result.current.annotations[1]).toHaveLength(1);
  });

  it("moves ink between two pages as one change, which one undo takes back", async () => {
    const { result } = renderInk();
    await waitFor(() => expect(result.current.inkReady).toBe(true));
    const moved = stroke(1);
    act(() => result.current.onPageStrokesChange(0, [moved]));
    act(() => result.current.onPagesStrokesChange({ 0: [], 1000: [moved] }));
    expect(result.current.annotations[0]).toEqual([]);
    expect(result.current.annotations[1000]).toEqual([moved]);

    act(() => result.current.onUndo());
    expect(result.current.annotations[0]).toEqual([moved]);
    expect(result.current.annotations[1000]).toEqual([]);
  });

  it("draws on the lesson's own Draft while it's on screen, and keeps that ink apart from the exercise's", async () => {
    const { result, rerender } = renderHook(
      ({ draftSession }: { draftSession: number | null }) => useLessonInk({
        storageKey: "lesson-ink-test",
        sessionIds: [100],
        exercises: [first, second],
        openExercise: first,
        openSource: null,
        lessonDraftId: draftSession === null ? null : lessonDraftId(draftSession),
      }),
      { initialProps: { draftSession: 100 as number | null } },
    );
    await waitFor(() => expect(result.current.inkReady).toBe(true));
    expect(result.current.inkOpen).toBe(true);
    act(() => result.current.onPageStrokesChange(1000, [stroke(1)]));
    expect(result.current.openHasInk).toBe(true);
    expect(result.current.hasAnnotations(lessonDraftId(100))).toBe(true);
    expect(result.current.hasAnnotations(first.id)).toBe(false);

    // Putting the Draft away shows the exercise's own ink again.
    rerender({ draftSession: null });
    expect(result.current.annotations).toEqual({});
    expect(result.current.openHasInk).toBe(false);
  });

  it("keeps its handlers the same while the same exercise is open", async () => {
    const { result, rerender } = renderInk();
    await waitFor(() => expect(result.current.inkReady).toBe(true));
    const before = result.current;
    act(() => result.current.onPageStrokesChange(0, [stroke(1)]));
    rerender({ openExercise: first, source: null });
    for (const name of ["onPageStrokesChange", "onPagesStrokesChange", "onUndo", "onRedo", "onClearAll", "onClearPage", "onClearPages"] as const) {
      expect(result.current[name]).toBe(before[name]);
    }
  });

  it("holds the Hand until the lesson's ink has loaded", async () => {
    let finishLoading!: (value: { pages: never[] }) => void;
    h.read.mockImplementation(() => new Promise((resolve) => { finishLoading = resolve; }));
    const { result } = renderInk();
    act(() => result.current.tools.toggleFromKey("pen"));
    expect(result.current.tools.drawingEnabled).toBe(false);

    await act(async () => finishLoading({ pages: [] }));
    act(() => result.current.tools.toggleFromKey("pen"));
    expect(result.current.tools.drawingEnabled).toBe(true);
  });

  it("keeps how Download All saves the open exercise beside its ink", async () => {
    const source = { name: "annotated-Sheet 1" };
    const { result } = renderInk(first, source);
    await waitFor(() => expect(result.current.getInkSource(1)).toEqual(source));
  });

  it("warns before the tab closes while some ink hasn't reached the server", async () => {
    const { result } = renderInk();
    await waitFor(() => expect(result.current.inkReady).toBe(true));
    const closing = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(closing()).toBe(false);
    act(() => result.current.onPageStrokesChange(0, [stroke(1)]));
    expect(closing()).toBe(true);
  });
});
