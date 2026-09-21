import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { AnswerSearchResult } from "@/lib/answer-file-utils";
import type { HomeworkCompletion } from "@/types";

const { load, search, countPages } = vi.hoisted(() => ({
  load: vi.fn(),
  search: vi.fn(),
  countPages: vi.fn(),
}));
vi.mock("@/lib/lesson-pdf-loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/lesson-pdf-loader")>()),
  loadExercisePdf: load,
}));
vi.mock("@/lib/answer-file-utils", () => ({ searchAnswerFile: search }));
vi.mock("@/lib/pdf-utils", () => ({ getPageCount: countPages }));

import { useHomeworkAnswer } from "./useHomeworkAnswer";

const homework = (fields: Partial<HomeworkCompletion> = {}): HomeworkCompletion => ({
  session_exercise_id: 10,
  current_session_id: 200,
  student_id: 1,
  pdf_name: "Ch5.pdf",
  page_start: 4,
  page_end: 5,
  attachment_count: 0,
  files: [],
  ...fields,
});

function renderAnswer(hw: HomeworkCompletion, searches = new Map<string, AnswerSearchResult | null>()) {
  const cache = new Map<string, ArrayBuffer>();
  const hook = renderHook(({ item }) => useHomeworkAnswer(item, cache, searches), { initialProps: { item: hw } });
  return { ...hook, cache, searches };
}

beforeEach(() => {
  load.mockReset().mockImplementation(async () => ({ data: new ArrayBuffer(8), source: "local" }));
  search.mockReset().mockResolvedValue({ path: "Ch5_ANS.pdf", source: "local" });
  countPages.mockReset().mockResolvedValue(10);
});

describe("useHomeworkAnswer", () => {
  it("opens the answer key chosen for the homework, without searching", async () => {
    const { result } = renderAnswer(homework({ answer_pdf_name: "Chosen_ANS.pdf", answer_page_start: 2, answer_page_end: 3 }));
    await waitFor(() => expect(result.current.answer.kind).toBe("ready"));
    expect(search).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledWith("Chosen_ANS.pdf", expect.any(Function));
    expect(result.current.answer).toMatchObject({ path: "Chosen_ANS.pdf", pageNumbers: [2, 3] });
  });

  it("searches by the worksheet's name when none was chosen, and follows the worksheet's pages", async () => {
    const { result, searches } = renderAnswer(homework());
    expect(result.current.answer.kind).toBe("searching");
    await waitFor(() => expect(result.current.answer.kind).toBe("ready"));
    expect(search).toHaveBeenCalledWith("Ch5.pdf");
    expect(result.current.answer).toMatchObject({ path: "Ch5_ANS.pdf", pageNumbers: [4, 5] });
    // Remembered for whoever opened the viewer, so coming back doesn't search again.
    expect(searches.get("Ch5.pdf")?.path).toBe("Ch5_ANS.pdf");
  });

  it("doesn't search again for a worksheet it has already looked for", async () => {
    const { result } = renderAnswer(homework(), new Map([["Ch5.pdf", { path: "Known_ANS.pdf", source: "local" as const }]]));
    await waitFor(() => expect(result.current.answer.kind).toBe("ready"));
    expect(search).not.toHaveBeenCalled();
  });

  it("says when there's no answer key, and looks again when asked", async () => {
    search.mockResolvedValueOnce(null);
    const { result } = renderAnswer(homework());
    await waitFor(() => expect(result.current.answer.kind).toBe("none"));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.answer.kind).toBe("ready"));
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("treats a search that fails as finding nothing", async () => {
    search.mockRejectedValueOnce(new Error("Shelv is down"));
    const { result } = renderAnswer(homework());
    await waitFor(() => expect(result.current.answer.kind).toBe("none"));
  });

  it("reports an answer key that can't be opened", async () => {
    load.mockResolvedValue({ error: "file_not_found" });
    const { result } = renderAnswer(homework({ answer_pdf_name: "Gone_ANS.pdf" }));
    await waitFor(() => expect(result.current.answer).toEqual({ kind: "failed", path: "Gone_ANS.pdf" }));
  });

  it("shows every page when the answer file doesn't have the worksheet's pages", async () => {
    countPages.mockResolvedValue(2);
    const { result } = renderAnswer(homework({ answer_pdf_name: "Short_ANS.pdf" }));
    await waitFor(() => expect(result.current.answer.kind).toBe("ready"));
    expect(result.current.answer).toMatchObject({ pageNumbers: [] });
  });

  it("never shows the last homework's answers while the next one's are on their way", async () => {
    const { result, rerender } = renderAnswer(homework({ answer_pdf_name: "First_ANS.pdf" }));
    await waitFor(() => expect(result.current.answer.kind).toBe("ready"));

    load.mockImplementation(() => new Promise(() => {}));
    rerender({ item: homework({ session_exercise_id: 11, answer_pdf_name: "Second_ANS.pdf" }) });
    expect(result.current.answer.kind).toBe("loading");
  });
});
