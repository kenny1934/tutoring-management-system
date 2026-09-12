import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { SessionExercise } from "@/types";

const h = vi.hoisted(() => ({ load: vi.fn(), search: vi.fn() }));
vi.mock("@/lib/lesson-pdf-loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/lesson-pdf-loader")>()),
  loadExercisePdf: h.load,
}));
vi.mock("@/lib/answer-file-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/answer-file-utils")>()),
  searchAnswerFile: h.search,
}));

import { useAnswerKey } from "./useAnswerKey";

type LoadResult = { data: ArrayBuffer; source: "local" } | { error: string };

function exercise(id: number, pdfName: string | null, extra: Partial<SessionExercise> = {}): SessionExercise {
  return {
    id, session_id: 1, exercise_type: "CW", pdf_name: pdfName, page_start: null, page_end: null, remarks: null,
    answer_page_start: 4, answer_page_end: 5, ...extra,
  } as unknown as SessionExercise;
}

/** Something that waits until the test settles it. */
function held<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { settle = resolve; });
  return { promise, settle };
}

const answersFor = (pdfName: string) => ({ path: `ANS ${pdfName}`, source: "local" as const });

function renderAnswerKey(first: SessionExercise | null, cache = new Map<string, ArrayBuffer>()) {
  return renderHook(({ open }) => useAnswerKey(open, cache), { initialProps: { open: first } });
}

const A = exercise(1, "A.pdf");
const B = exercise(2, "B.pdf");

beforeEach(() => {
  h.load.mockReset().mockImplementation(async () => ({ data: new ArrayBuffer(8), source: "local" }));
  h.search.mockReset().mockImplementation(async (pdfName: string) => answersFor(pdfName));
});

describe("useAnswerKey finding the answer file", () => {
  it("uses the answer file the exercise names, without searching", () => {
    const { result } = renderAnswerKey(exercise(1, "A.pdf", { answer_pdf_name: "Answers\\A.pdf" }));
    expect(result.current.answerKeyFound).toBe(true);
    expect(h.search).not.toHaveBeenCalled();
  });

  it("searches for one by the worksheet's file, and doesn't search for that file twice", async () => {
    const { result, rerender } = renderAnswerKey(A);
    expect(result.current.answerKeySearching).toBe(true);
    await waitFor(() => expect(result.current.answerKeyFound).toBe(true));
    rerender({ open: B });
    await waitFor(() => expect(result.current.answerKeyFound).toBe(true));
    rerender({ open: exercise(3, "A.pdf") });
    expect(result.current.answerKeyFound).toBe(true);
    expect(h.search).toHaveBeenCalledTimes(2);
  });

  it("has none when the search finds nothing, or fails", async () => {
    h.search.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("Paperless is down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, rerender } = renderAnswerKey(A);
    await waitFor(() => expect(result.current.answerKeySearching).toBe(false));
    expect(result.current.answerKeyFound).toBe(false);
    rerender({ open: B });
    await waitFor(() => expect(result.current.answerKeySearching).toBe(false));
    expect(result.current.answerKeyFound).toBe(false);
  });

  it("drops the last exercise's answer key while the new one is looked for", async () => {
    const searchForB = held<{ path: string; source: "local" }>();
    h.search.mockImplementation(async (pdfName: string) => (pdfName === "B.pdf" ? searchForB.promise : answersFor(pdfName)));
    const { result, rerender } = renderAnswerKey(A);
    await waitFor(() => expect(result.current.answerKeyFound).toBe(true));

    rerender({ open: B });
    expect(result.current.answerKeyFound).toBe(false);
    act(() => result.current.toggleAnswerKey());
    expect(h.load).not.toHaveBeenCalled();
  });

  it("has nothing to show for an exercise with no file", () => {
    const { result } = renderAnswerKey(exercise(1, null));
    expect(result.current.answerKeyFound).toBe(false);
    expect(result.current.answerKeySearching).toBe(false);
  });
});

describe("useAnswerKey showing the answer key", () => {
  it("loads the answer file and its pages when opened, and keeps it in the cache", async () => {
    const cache = new Map<string, ArrayBuffer>();
    const { result } = renderAnswerKey(A, cache);
    await waitFor(() => expect(result.current.answerKeyFound).toBe(true));

    act(() => result.current.toggleAnswerKey());
    expect(result.current.showAnswerKey).toBe(true);
    await waitFor(() => expect(result.current.answerPdfData).not.toBeNull());
    expect(result.current.answerPageNumbers).toEqual([4, 5]);
    expect(result.current.answerLoading).toBe(false);
    expect(cache.has("ANS A.pdf")).toBe(true);
    expect(h.load).toHaveBeenCalledWith("ANS A.pdf");
  });

  it("brings the answer key to the front on a phone when it opens", async () => {
    const { result } = renderAnswerKey(A);
    await waitFor(() => expect(result.current.answerKeyFound).toBe(true));
    expect(result.current.mobileActiveTab).toBe("exercise");
    act(() => result.current.toggleAnswerKey());
    expect(result.current.mobileActiveTab).toBe("answer");
  });

  it("remembers which exercises had it open", async () => {
    const { result, rerender } = renderAnswerKey(A);
    await waitFor(() => expect(result.current.answerKeyFound).toBe(true));
    act(() => result.current.toggleAnswerKey());
    rerender({ open: B });
    expect(result.current.showAnswerKey).toBe(false);
    rerender({ open: A });
    expect(result.current.showAnswerKey).toBe(true);
  });

  it("stops loading when it moves to an answer file already in the cache while another is loading", async () => {
    const loadForA = held<LoadResult>();
    h.load.mockImplementation(async (path: string) =>
      path === "ANS A.pdf" ? loadForA.promise : { data: new ArrayBuffer(8), source: "local" });
    const cache = new Map<string, ArrayBuffer>();
    const { result, rerender } = renderAnswerKey(B, cache);

    // B's answer key is opened and loaded first, so it's in the cache.
    await waitFor(() => expect(result.current.answerKeyFound).toBe(true));
    act(() => result.current.toggleAnswerKey());
    await waitFor(() => expect(cache.has("ANS B.pdf")).toBe(true));

    // A's answer key is opened, and its load hangs.
    rerender({ open: A });
    await waitFor(() => expect(result.current.answerKeyFound).toBe(true));
    act(() => result.current.toggleAnswerKey());
    expect(result.current.answerLoading).toBe(true);

    // Back to B, whose answer key was left open and is already here.
    rerender({ open: B });
    await waitFor(() => expect(result.current.answerPdfData).toBe(cache.get("ANS B.pdf")));
    expect(result.current.answerLoading).toBe(false);
  });

  it("stops loading when it's closed mid-load", async () => {
    h.load.mockImplementation(() => held<LoadResult>().promise);
    const { result } = renderAnswerKey(A);
    await waitFor(() => expect(result.current.answerKeyFound).toBe(true));
    act(() => result.current.toggleAnswerKey());
    expect(result.current.answerLoading).toBe(true);
    act(() => result.current.toggleAnswerKey());
    expect(result.current.answerLoading).toBe(false);
  });

  it("says the answer key failed to load when the load reports an error or throws", async () => {
    h.load.mockResolvedValueOnce({ error: "file_not_found" }).mockRejectedValueOnce(new Error("The network went away"));
    const { result, rerender } = renderAnswerKey(A);
    await waitFor(() => expect(result.current.answerKeyFound).toBe(true));
    act(() => result.current.toggleAnswerKey());
    await waitFor(() => expect(result.current.answerError).toBe("Failed to load answer key"));
    expect(result.current.answerLoading).toBe(false);

    rerender({ open: B });
    await waitFor(() => expect(result.current.answerKeyFound).toBe(true));
    act(() => result.current.toggleAnswerKey());
    await waitFor(() => expect(result.current.answerLoading).toBe(false));
    expect(result.current.answerError).toBe("Failed to load answer key");
  });
});
