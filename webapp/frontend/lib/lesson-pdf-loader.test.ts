import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  supported: vi.fn(), handle: vi.fn(), cached: vi.fn(), remember: vi.fn(),
  search: vi.fn(), compose: vi.fn(),
}));
vi.mock("./file-system", () => ({
  isFileSystemAccessSupported: h.supported, getFileHandleFromPath: h.handle,
  getCachedPaperlessDocumentId: h.cached, setPaperlessPathCache: h.remember,
}));
vi.mock("./summer-courseware-scan", () => ({ parseSummerCoursewarePath: () => null, readCoursewareFile: vi.fn() }));
vi.mock("./pdf-utils", () => ({ composeSideBySidePdf: h.compose }));
vi.mock("./paperless-utils", () => ({ searchPaperlessByPath: h.search }));

import { loadExercisePdf, PDF_LOAD_TIMEOUT_MS } from "./lesson-pdf-loader";

const bytes = new TextEncoder().encode("%PDF-1.7\n").buffer;
beforeEach(() => {
  vi.useFakeTimers();
  h.supported.mockReturnValue(false);
  h.cached.mockReturnValue(42);
  h.search.mockReset();
  h.handle.mockReset();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => ({ arrayBuffer: async () => bytes }) })));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("lesson PDF recovery", () => {
  it("stops a stalled download at the deadline and allows a clean retry", async () => {
    let signal!: AbortSignal;
    vi.mocked(fetch).mockImplementationOnce((_url, options) => {
      signal = options!.signal as AbortSignal;
      return new Promise(() => {});
    });
    const pending = loadExercisePdf("A.pdf");
    await vi.advanceTimersByTimeAsync(PDF_LOAD_TIMEOUT_MS);
    expect(await pending).toEqual({ error: "timed_out" });
    expect(signal.aborted).toBe(true);
    expect(await loadExercisePdf("A.pdf")).toEqual({ data: bytes, source: "paperless" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases a stalled local read and never starts a late remote request", async () => {
    h.supported.mockReturnValue(true);
    let settle!: (value: { success: boolean }) => void;
    h.handle.mockReturnValue(new Promise(resolve => { settle = resolve; }));
    const progress = vi.fn();
    const pending = loadExercisePdf("A.pdf", progress);
    await vi.advanceTimersByTimeAsync(PDF_LOAD_TIMEOUT_MS);
    expect(await pending).toEqual({ error: "timed_out" });
    const calls = progress.mock.calls.length;
    settle({ success: false });
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(h.search).not.toHaveBeenCalled();
    expect(progress).toHaveBeenCalledTimes(calls);
  });

  it("passes the deadline signal through the document search", async () => {
    h.cached.mockReturnValue(null);
    h.search.mockImplementation((_path, _progress, signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const pending = loadExercisePdf("A.pdf");
    await vi.advanceTimersByTimeAsync(PDF_LOAD_TIMEOUT_MS);
    expect(await pending).toEqual({ error: "timed_out" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([[404, "file_not_found"], [503, "fetch_failed"]])("distinguishes a %s response from a missing assignment", async (status, error) => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status } as Response);
    expect(await loadExercisePdf("A.pdf")).toEqual({ error });
    expect(vi.getTimerCount()).toBe(0);
  });
});
