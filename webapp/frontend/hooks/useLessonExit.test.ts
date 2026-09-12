import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { AnnotatedExercise } from "@/lib/annotated-zip";

const h = vi.hoisted(() => ({ buildZip: vi.fn(), downloadBlob: vi.fn(), showToast: vi.fn() }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock("@/lib/annotated-zip", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/annotated-zip")>()),
  buildAnnotatedZip: h.buildZip,
}));
vi.mock("@/lib/geometry-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/geometry-utils")>()),
  downloadBlob: h.downloadBlob,
}));

import { useLessonExit } from "./useLessonExit";

const listedSheet: AnnotatedExercise = { pdfName: "Listed.pdf", pageNumbers: [], stamp: undefined, name: "annotated-Listed" };
const keptSheet: AnnotatedExercise = { pdfName: "Preview.pdf", pageNumbers: [], stamp: undefined, name: "annotated-Preview" };

function renderExit({ allSent = true } = {}) {
  const options = {
    flushInk: vi.fn(async () => allSent),
    clearStorage: vi.fn(),
    getAllAnnotations: vi.fn(() => new Map()),
    getInkSource: vi.fn((id: number) => (id === 99 ? keptSheet : undefined)),
    describeListed: vi.fn((id: number) => (id === 1 ? listedSheet : id === 2 ? null : undefined)),
    cache: new Map<string, ArrayBuffer>(),
    zipName: "Annotations_2026-09-11_16:45 - 18:15",
    leave: vi.fn(),
  };
  const hook = renderHook(() => useLessonExit(options));
  return { ...hook, options };
}

beforeEach(() => {
  h.buildZip.mockReset().mockResolvedValue({ zip: new Blob(["zip"]), saved: 2, failed: 0 });
  h.downloadBlob.mockReset();
  h.showToast.mockReset();
});

describe("useLessonExit leaving", () => {
  it("leaves straight away once every page has reached the server, and forgets what the tab kept", async () => {
    const { result, options } = renderExit();
    await act(() => result.current.attemptExit());
    expect(options.clearStorage).toHaveBeenCalledTimes(1);
    expect(options.leave).toHaveBeenCalledTimes(1);
    expect(result.current.showExitConfirm).toBe(false);
  });

  it("asks first when some pages can't reach the server, and keeps what the tab kept", async () => {
    const { result, options } = renderExit({ allSent: false });
    await act(() => result.current.attemptExit());
    expect(result.current.showExitConfirm).toBe(true);
    expect(options.leave).not.toHaveBeenCalled();
    expect(options.clearStorage).not.toHaveBeenCalled();
  });

  it("closes the dialog and leaves at Exit anyway, still keeping the pages that didn't arrive", async () => {
    const { result, options } = renderExit({ allSent: false });
    await act(() => result.current.attemptExit());
    act(() => result.current.exitAnyway());
    expect(result.current.showExitConfirm).toBe(false);
    expect(options.leave).toHaveBeenCalledTimes(1);
    expect(options.clearStorage).not.toHaveBeenCalled();
  });

  it("closes the dialog and stays at Stay", async () => {
    const { result, options } = renderExit({ allSent: false });
    await act(() => result.current.attemptExit());
    act(() => result.current.stay());
    expect(result.current.showExitConfirm).toBe(false);
    expect(options.leave).not.toHaveBeenCalled();
  });

  it("leaves after Download all and exit once everything was saved", async () => {
    const { result, options } = renderExit({ allSent: false });
    await act(() => result.current.attemptExit());
    await act(() => result.current.saveAllAndExit());
    expect(h.downloadBlob).toHaveBeenCalledTimes(1);
    expect(result.current.showExitConfirm).toBe(false);
    expect(options.leave).toHaveBeenCalledTimes(1);
  });

  it("stays after Download all and exit when something couldn't be saved, and says so", async () => {
    h.buildZip.mockResolvedValue({ zip: new Blob(["zip"]), saved: 1, failed: 1 });
    const { result, options } = renderExit({ allSent: false });
    await act(() => result.current.attemptExit());
    await act(() => result.current.saveAllAndExit());
    expect(h.showToast).toHaveBeenCalledWith(expect.any(String), "error");
    expect(result.current.showExitConfirm).toBe(false);
    expect(options.leave).not.toHaveBeenCalled();
  });
});

describe("useLessonExit downloading all the ink", () => {
  it("saves it into one file named for the lesson, with each run of spaces as one hyphen", async () => {
    const { result } = renderExit();
    let saved = false;
    await act(async () => { saved = await result.current.downloadAllInk(); });
    expect(saved).toBe(true);
    expect(h.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "Annotations_2026-09-11_16:45---18:15.zip");
  });

  it("saves a listed exercise the view's way, and one that has left the lists the way it was kept", async () => {
    const { result } = renderExit();
    await act(() => result.current.downloadAllInk());
    const describe = h.buildZip.mock.calls[0][1] as (id: number) => AnnotatedExercise | null;
    expect(describe(1)).toBe(listedSheet);
    expect(describe(2)).toBeNull();
    expect(describe(99)).toBe(keptSheet);
    expect(describe(5)).toBeNull();
  });

  it("says it's saving while the file is built", async () => {
    let finish!: (value: unknown) => void;
    h.buildZip.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderExit();
    let download!: Promise<boolean>;
    act(() => { download = result.current.downloadAllInk(); });
    expect(result.current.isSavingAll).toBe(true);
    await act(async () => {
      finish({ zip: null, saved: 0, failed: 0 });
      await download;
    });
    await waitFor(() => expect(result.current.isSavingAll).toBe(false));
  });

  it("tells the tutor when building the file fails outright", async () => {
    h.buildZip.mockRejectedValue(new Error("pdf-lib gave up"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderExit();
    let saved = true;
    await act(async () => { saved = await result.current.downloadAllInk(); });
    expect(saved).toBe(false);
    expect(h.showToast).toHaveBeenCalledWith(expect.any(String), "error");
  });
});
