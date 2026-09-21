import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { SessionExercise } from "@/types";

const load = vi.hoisted(() => vi.fn());
vi.mock("@/lib/lesson-pdf-loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/lesson-pdf-loader")>()),
  loadExercisePdf: load,
}));

import { useExercisePdf } from "./useExercisePdf";
import { NO_FILE_ERROR } from "@/lib/lesson-utils";

type LoadResult = { data: ArrayBuffer; source: "local" } | { error: string };

function exercise(id: number, pdfName: string | null, extra: Partial<SessionExercise> = {}): SessionExercise {
  return {
    id, session_id: 1, exercise_type: "CW", pdf_name: pdfName, page_start: 2, page_end: 3, remarks: null, ...extra,
  } as unknown as SessionExercise;
}

/** A load that waits until the test settles it. */
function heldLoad() {
  let settle!: (result: LoadResult) => void;
  const promise = new Promise<LoadResult>((resolve) => { settle = resolve; });
  return { promise, settle };
}

function renderPdf(first: SessionExercise | null, cache = new Map<string, ArrayBuffer>()) {
  return renderHook(({ open }) => useExercisePdf(open, cache), { initialProps: { open: first } });
}

beforeEach(() => {
  load.mockReset().mockImplementation(async () => ({ data: new ArrayBuffer(8), source: "local" }));
});

describe("useExercisePdf", () => {
  it("loads the exercise's file, keeps it in the cache, and gives the pages to show", async () => {
    const cache = new Map<string, ArrayBuffer>();
    const { result } = renderPdf(exercise(1, "A.pdf"), cache);
    expect(result.current.pageNumbers).toEqual([2, 3]);
    await waitFor(() => expect(result.current.pdfData).not.toBeNull());
    expect(result.current.pdfLoading).toBe(false);
    expect(cache.has("A.pdf")).toBe(true);
  });

  it("shows a file that's already in the cache without loading it", () => {
    const bytes = new ArrayBuffer(4);
    const { result } = renderPdf(exercise(1, "A.pdf"), new Map([["A.pdf", bytes]]));
    expect(result.current.pdfData).toBe(bytes);
    expect(load).not.toHaveBeenCalled();
  });

  it.each([
    ["no_file", NO_FILE_ERROR],
    ["fetch_failed", "Failed to download PDF"],
    ["file_not_found", "File not found"],
  ])("says what went wrong when the load reports %s", async (error, message) => {
    load.mockResolvedValue({ error });
    const { result } = renderPdf(exercise(1, "A.pdf"));
    await waitFor(() => expect(result.current.pdfError).toBe(message));
    expect(result.current.pdfLoading).toBe(false);
  });

  it("says an exercise with no file has none, without trying to load one", () => {
    const { result } = renderPdf(exercise(1, null));
    expect(result.current.pdfError).toBe(NO_FILE_ERROR);
    expect(load).not.toHaveBeenCalled();
  });

  it("has nothing to load for an exercise that's a web link", () => {
    const { result } = renderPdf(exercise(1, null, { url: "https://example.com/sheet" }));
    expect(result.current.pdfError).toBeNull();
    expect(result.current.pdfData).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it("keeps the newest exercise's file when an older load finishes late", async () => {
    const slow = heldLoad();
    const newer = new ArrayBuffer(2);
    load.mockImplementation(async (name: string) =>
      name === "A.pdf" ? slow.promise : { data: newer, source: "local" });
    const { result, rerender } = renderPdf(exercise(1, "A.pdf"));
    rerender({ open: exercise(2, "B.pdf") });
    await waitFor(() => expect(result.current.pdfData).toBe(newer));

    await act(async () => slow.settle({ data: new ArrayBuffer(9), source: "local" }));
    expect(result.current.pdfData).toBe(newer);
  });

  it("never hands the last exercise's file to the render that opens the next one", async () => {
    const cache = new Map<string, ArrayBuffer>();
    const seen: (ArrayBuffer | null)[] = [];
    load.mockImplementation(async (name: string) =>
      name === "A.pdf" ? { data: new ArrayBuffer(8), source: "local" } : heldLoad().promise);
    const { result, rerender } = renderHook(({ open }) => {
      const pdf = useExercisePdf(open, cache);
      seen.push(pdf.pdfData);
      return pdf;
    }, { initialProps: { open: exercise(1, "A.pdf") } });
    await waitFor(() => expect(result.current.pdfData).not.toBeNull());

    seen.length = 0;
    rerender({ open: exercise(2, "B.pdf") });
    expect(seen.every((data) => data === null)).toBe(true);
  });

  it("keeps a file that finishes loading after the tutor has moved on", async () => {
    const slow = heldLoad();
    const late = new ArrayBuffer(9);
    load.mockImplementation(async (name: string) =>
      name === "A.pdf" ? slow.promise : { data: new ArrayBuffer(2), source: "local" });
    const cache = new Map<string, ArrayBuffer>();
    const { rerender } = renderPdf(exercise(1, "A.pdf"), cache);
    rerender({ open: exercise(2, "B.pdf") });

    await act(async () => slow.settle({ data: late, source: "local" }));
    expect(cache.get("A.pdf")).toBe(late);
  });

  it("stops loading when it moves to a file already in the cache while another is loading", async () => {
    const held = heldLoad();
    load.mockImplementation(async (_name: string, onProgress?: (message: string) => void) => {
      onProgress?.("Checking Paperless cache…");
      return held.promise;
    });
    const cachedBytes = new ArrayBuffer(3);
    const { result, rerender } = renderPdf(exercise(1, "A.pdf"), new Map([["B.pdf", cachedBytes]]));
    await waitFor(() => expect(result.current.pdfLoadingMessage).toBe("Checking Paperless cache…"));
    expect(result.current.pdfLoading).toBe(true);

    rerender({ open: exercise(2, "B.pdf") });
    expect(result.current.pdfData).toBe(cachedBytes);
    expect(result.current.pdfLoading).toBe(false);
    expect(result.current.pdfLoadingMessage).toBeNull();
  });

  it("stops loading when it moves to an exercise with no file while another is loading", async () => {
    load.mockImplementation(() => heldLoad().promise);
    const { result, rerender } = renderPdf(exercise(1, "A.pdf"));
    await waitFor(() => expect(result.current.pdfLoading).toBe(true));

    rerender({ open: exercise(2, null) });
    expect(result.current.pdfError).toBe(NO_FILE_ERROR);
    expect(result.current.pdfLoading).toBe(false);
  });

  it("stops loading and says the download failed when the load throws", async () => {
    load.mockRejectedValue(new Error("The network went away"));
    const { result } = renderPdf(exercise(1, "A.pdf"));
    await waitFor(() => expect(result.current.pdfError).toBe("Failed to download PDF"));
    expect(result.current.pdfLoading).toBe(false);
  });

  it("forgets the file and loads it again on retry", async () => {
    const cache = new Map<string, ArrayBuffer>();
    const { result } = renderPdf(exercise(1, "A.pdf"), cache);
    await waitFor(() => expect(result.current.pdfData).not.toBeNull());

    act(() => result.current.retry());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.pdfLoading).toBe(false));
    expect(result.current.pdfData).not.toBeNull();
  });
});
