import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { bulkPrintErrorMessage, printErrorMessage } from "@/lib/lesson-utils";
import type { Session, SessionExercise } from "@/types";

const h = vi.hoisted(() => ({
  showToast: vi.fn(),
  printFile: vi.fn(),
  printBlob: vi.fn(),
  loadPdf: vi.fn(),
  bulkPrint: vi.fn(),
  searchPaperless: vi.fn(),
}));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock("@/lib/file-system", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/file-system")>()),
  printFileFromPathWithFallback: h.printFile,
  printPdfBlob: h.printBlob,
}));
vi.mock("@/lib/lesson-pdf-loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/lesson-pdf-loader")>()),
  loadExercisePdf: h.loadPdf,
}));
vi.mock("@/lib/bulk-exercise-download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bulk-exercise-download")>()),
  bulkPrintAllStudents: h.bulkPrint,
}));
vi.mock("@/lib/paperless-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paperless-utils")>()),
  searchPaperlessByPath: h.searchPaperless,
}));

import { usePrintExercise } from "./usePrintExercise";

const LINEAR = "Algebra\\Linear equations 3.pdf";
const stamp = { studentName: "Chan Tai Man", location: "MSA" };

function exercise(overrides: Partial<SessionExercise> = {}): SessionExercise {
  return {
    id: 1001, session_id: 100, exercise_type: "CW", pdf_name: LINEAR,
    page_start: 2, page_end: 4, remarks: null, ...overrides,
  } as unknown as SessionExercise;
}

function lesson(id: number, name: string, types: ("CW" | "HW")[]): Session {
  return {
    id, student_id: id + 800, student_name: name, school_student_id: String(id), location: "MSA",
    session_date: "2026-09-11", time_slot: "16:45 - 18:15",
    exercises: types.map((type, i) => exercise({ id: id * 10 + i, session_id: id, exercise_type: type })),
  } as unknown as Session;
}

/** A promise the test settles by hand, for looking at the hook while a print is under way. */
function held<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { settle = resolve; });
  return { promise, settle };
}

beforeEach(() => {
  h.showToast.mockReset();
  h.printFile.mockReset().mockResolvedValue(null);
  h.printBlob.mockReset().mockReturnValue(true);
  h.loadPdf.mockReset().mockResolvedValue({ data: new ArrayBuffer(8) });
  h.bulkPrint.mockReset().mockResolvedValue(null);
  h.searchPaperless.mockReset().mockResolvedValue(null);
});

describe("usePrintExercise printing one exercise", () => {
  it("prints the exercise's pages with its stamp, showing which exercise is printing until it's done", async () => {
    const job = held<string | null>();
    h.printFile.mockReturnValue(job.promise);
    const { result } = renderHook(() => usePrintExercise());
    let printed!: Promise<void>;
    act(() => { printed = result.current.printExercise(exercise(), stamp); });
    expect(result.current.printing.id).toBe(1001);
    expect(h.printFile).toHaveBeenCalledWith(LINEAR, 2, 4, undefined, stamp, expect.any(Function));

    await act(async () => { job.settle(null); await printed; });
    expect(result.current.printing).toEqual({ id: null, progress: null });
    expect(h.showToast).not.toHaveBeenCalled();
  });

  it("shows how the search in Paperless is going while it looks for the file", async () => {
    h.searchPaperless.mockImplementation(async (_path: string, onProgress?: (message: string) => void) => {
      onProgress?.("Searching Paperless");
      return null;
    });
    const job = held<string | null>();
    h.printFile.mockImplementation(async (...args: unknown[]) => {
      const search = args[5] as (path: string) => Promise<number | null>;
      await search(LINEAR);
      return job.promise;
    });
    const { result } = renderHook(() => usePrintExercise());
    let printed!: Promise<void>;
    act(() => { printed = result.current.printExercise(exercise(), stamp); });
    await waitFor(() => expect(result.current.printing.progress).toBe("Searching Paperless"));
    await act(async () => { job.settle(null); await printed; });
    expect(result.current.printing.progress).toBeNull();
  });

  it("prints a class-wide preview from the file the lesson loaded, with no stamp", async () => {
    const { result } = renderHook(() => usePrintExercise());
    await act(() => result.current.printExercise(exercise({ id: -5 }), stamp));
    expect(h.loadPdf).toHaveBeenCalledWith(LINEAR);
    expect(h.printBlob).toHaveBeenCalledWith(expect.any(Blob));
    expect(h.printFile).not.toHaveBeenCalled();
  });

  it("tells the tutor when the browser blocks the preview's print window", async () => {
    h.printBlob.mockReturnValue(false);
    const { result } = renderHook(() => usePrintExercise());
    await act(() => result.current.printExercise(exercise({ id: -5 }), stamp));
    expect(h.showToast).toHaveBeenCalledWith(printErrorMessage("popup_blocked"), "error");
  });

  it("tells the tutor when the file can't be printed, and stops showing it as printing", async () => {
    h.printFile.mockResolvedValue("fetch_failed");
    const { result } = renderHook(() => usePrintExercise());
    await act(() => result.current.printExercise(exercise(), stamp));
    expect(h.showToast).toHaveBeenCalledWith(printErrorMessage("fetch_failed"), "error");
    expect(result.current.printing.id).toBeNull();
  });

  it("does nothing for an exercise with no file", async () => {
    const { result } = renderHook(() => usePrintExercise());
    await act(() => result.current.printExercise(exercise({ pdf_name: "" }), stamp));
    expect(h.printFile).not.toHaveBeenCalled();
    expect(result.current.printing.id).toBeNull();
  });
});

describe("usePrintExercise printing several at once", () => {
  const chan = lesson(100, "Chan Tai Man", ["CW", "CW", "HW"]);
  const wong = lesson(101, "Wong Siu Ming", ["CW", "HW"]);
  const lee = lesson(102, "Lee Ka Yan", ["CW"]);

  it("prints every student's classwork as one job, showing the id it's given until it's done", async () => {
    const job = held<null>();
    h.bulkPrint.mockReturnValue(job.promise);
    const { result } = renderHook(() => usePrintExercise());
    let printed!: Promise<void>;
    act(() => { printed = result.current.printAll([chan, wong], "CW", -100); });
    expect(result.current.printing.id).toBe(-100);
    const groups = h.bulkPrint.mock.calls[0][0] as { studentName: string; exercises: unknown[] }[];
    expect(groups.map((group) => [group.studentName, group.exercises.length])).toEqual([
      ["Chan Tai Man", 2],
      ["Wong Siu Ming", 1],
    ]);

    await act(async () => { job.settle(null); await printed; });
    expect(result.current.printing.id).toBeNull();
  });

  it("says so when there's none of that type, and prints nothing", async () => {
    const { result } = renderHook(() => usePrintExercise());
    await act(() => result.current.printAll([lee], "HW"));
    expect(h.showToast).toHaveBeenCalledWith("No HW exercises found", "info");
    expect(h.bulkPrint).not.toHaveBeenCalled();
    expect(result.current.printing.id).toBeNull();
  });

  it("names the type when a print of one type fails, and not otherwise", async () => {
    h.bulkPrint.mockResolvedValue("no_valid_files");
    const { result } = renderHook(() => usePrintExercise());
    await act(() => result.current.printAll([chan], "HW"));
    expect(h.showToast).toHaveBeenLastCalledWith(bulkPrintErrorMessage("no_valid_files", "HW"), "error");

    await act(() => result.current.printGroups([{ studentName: "Chan Tai Man" } as never], -2));
    expect(h.showToast).toHaveBeenLastCalledWith(bulkPrintErrorMessage("no_valid_files"), "error");
  });

  it("prints nothing for an empty list of students", async () => {
    const { result } = renderHook(() => usePrintExercise());
    await act(() => result.current.printGroups([], -2));
    expect(h.bulkPrint).not.toHaveBeenCalled();
    expect(h.showToast).not.toHaveBeenCalled();
  });
});

it("keeps its functions the same between renders, so the sidebars don't redraw", () => {
  const { result, rerender } = renderHook(() => usePrintExercise());
  const first = result.current;
  rerender();
  expect(result.current.printExercise).toBe(first.printExercise);
  expect(result.current.printGroups).toBe(first.printGroups);
  expect(result.current.printAll).toBe(first.printAll);
});
