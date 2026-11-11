import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
const h = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("@/lib/pdf-utils", () => ({ getPdfJs: async () => ({ getDocument: h.getDocument }), extractPagesForPrint: vi.fn() }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
import { PdfPageViewer, type PdfViewState } from "./PdfPageViewer";
import { activateLessonResumeScope, lessonTarget, LessonResumeEntry, LessonResumeMemory } from "@/components/design-preview/lessonResume";
import type { SessionExercise } from "@/types";

const base = { pdfData: new ArrayBuffer(8), pageNumbers: [], isLoading: false, error: null, exerciseId: 1, exerciseLabel: "Linear equations 3" };
function documentTask() {
  return {
    destroy: vi.fn(async () => {}),
    promise: Promise.resolve({
      numPages: 1, destroy: vi.fn(),
      getPage: async () => ({ getViewport: () => ({ width: 600, height: 800 }), render: () => ({ promise: Promise.resolve() }) }),
    }),
  };
}
beforeEach(() => {
  vi.useFakeTimers();

  h.getDocument.mockReset().mockImplementation(documentTask);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob(["page"])));
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:worksheet"), revokeObjectURL: vi.fn() }));
});
afterEach(() => {

  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PDF preparation recovery", () => {
  it("restores a stored place after the entire viewer is unmounted and recreated", async () => {
    activateLessonResumeScope("viewer");
    const memory = new LessonResumeMemory("viewer");
    const target = lessonTarget(10, { id: 1, pdf_name: "A.pdf" } as SessionExercise);
    const entry = new LessonResumeEntry(memory, "class"); entry.reconcile([target]); entry.remember(target, "by-student");
    const first = render(<PdfPageViewer {...base} viewStates={entry.worksheet} onViewStateChange={entry.changed} />);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const scroll = first.container.querySelector<HTMLElement>("[data-native-pdf-scroll]")!;
    scroll.scrollTop = 310; fireEvent.scroll(scroll); entry.flush();
    const zoom = entry.worksheet.get(1)!.zoom;
    first.unmount();
    const restored = new LessonResumeEntry(memory, "class"); restored.reconcile([target]);
    const second = render(<PdfPageViewer {...base} viewStates={restored.worksheet} onViewStateChange={restored.changed} />);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(second.container.querySelector<HTMLElement>("[data-native-pdf-scroll]")!.scrollTop).toBe(310);
    expect(restored.worksheet.get(1)!.zoom).toBe(zoom);
    restored.flush();
  });
  it("reveals the pages after its one automatic processing retry succeeds", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.getDocument.mockImplementationOnce(() => ({ promise: Promise.reject(new Error("Worker unavailable")), destroy: vi.fn(async () => {}) }));
    render(<PdfPageViewer {...base} />);
    await act(async () => vi.advanceTimersByTimeAsync(501));
    expect(h.getDocument).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("img", { name: "Page 1" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("ends stalled preparation, stops the worker, and keeps the retry and focus controls available", async () => {
    const destroy = vi.fn(async () => {}), retry = vi.fn();
    h.getDocument.mockReturnValue({ promise: new Promise(() => {}), destroy });
    render(<PdfPageViewer {...base} onRetry={retry} toolbarStart={<button>Leave focus</button>} />);
    await act(async () => vi.advanceTimersByTimeAsync(45_000));
    expect(screen.getByRole("alert")).toHaveTextContent("The PDF took too long to prepare.");
    expect(screen.getByText(base.exerciseLabel)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave focus" })).toBeEnabled();
    expect(destroy).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("restores the same worksheet's zoom and reading position after a retry clears its bytes", async () => {
    const views = new Map<number, PdfViewState>();
    const { rerender, container } = render(<PdfPageViewer {...base} viewStates={views} />);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const scroll = container.querySelector<HTMLElement>("[data-native-pdf-scroll]")!;
    scroll.scrollTop = 210;
    fireEvent.scroll(scroll);
    const saved = { ...views.get(1)! };
    expect(saved.scrollTop).toBe(210);
    rerender(<PdfPageViewer {...base} pdfData={null} isLoading viewStates={views} />);
    rerender(<PdfPageViewer {...base} pdfData={new ArrayBuffer(9)} viewStates={views} />);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(container.querySelector<HTMLElement>("[data-native-pdf-scroll]")!.scrollTop).toBe(210);
    expect(views.get(1)!.zoom).toBe(saved.zoom);
  });
});
