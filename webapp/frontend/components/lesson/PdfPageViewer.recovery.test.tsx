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

it('does not replace a saved place while a loading placeholder has no scroller', async () => {
  const views = new Map<number, PdfViewState>();
  const view = render(<PdfPageViewer {...base} viewStates={views} />);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  const scroll = view.container.querySelector<HTMLElement>('[data-native-pdf-scroll]')!;
  scroll.scrollTop = 240; fireEvent.scroll(scroll);
  const saved = { ...views.get(1)! };
  view.rerender(<PdfPageViewer {...base} isLoading viewStates={views} onViewStateChange={() => {}} />);
  expect(views.get(1)).toEqual(saved);
});

describe('Progressive courseware preview', () => {
  beforeEach(() => { Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() }); });
  afterEach(() => { delete (HTMLElement.prototype as unknown as { scrollTo?: unknown }).scrollTo; });
  function delayedDocument() {
    const finish = new Map<number, () => void>();
    const rendered: number[] = [];
    const destroy = vi.fn(async () => {});
    h.getDocument.mockReturnValue({ destroy, promise: Promise.resolve({
      numPages: 5, destroy,
      getPage: async (number: number) => ({
        getViewport: () => ({ width: 600, height: 800 + number * 10 }),
        render: () => { rendered.push(number); return { promise: number === 3 ? Promise.resolve() : new Promise<void>(resolve => finish.set(number, resolve)) }; },
      }),
    }) });
    let url = 0;
    vi.mocked(URL.createObjectURL).mockImplementation(() => `blob:page-${++url}`);
    return { finish, rendered, destroy };
  }

  it('reveals the matching physical page first, keeps all page slots, and preserves a manual zoom as neighbours arrive', async () => {
    const { finish, rendered, destroy } = delayedDocument();
    const views = new Map<number, PdfViewState>();
    const view = render(<PdfPageViewer {...base} exerciseId={undefined} viewKey={9} viewStates={views} progressive renderConcurrency={2} initialPage={3} />);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(rendered[0]).toBe(3);
    const firstPage = screen.getByRole('img', { name: 'Page 3' });
    expect(screen.queryByRole('img', { name: 'Page 1' })).toBeNull();
    expect(view.container.querySelector('[data-native-pdf-pages]')!.children).toHaveLength(5);
    expect(firstPage.parentElement!.parentElement).toHaveStyle({ height: '830px' });
    expect(screen.getByRole('status')).toHaveTextContent('Preparing remaining pages');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    const scroll = view.container.querySelector<HTMLElement>('[data-native-pdf-scroll]')!;
    scroll.scrollTop = 220; fireEvent.scroll(scroll);
    const zoom = views.get(9)!.zoom;
    await act(async () => { finish.get(2)!(); finish.get(4)!(); await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole('img', { name: 'Page 2' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Page 3' })).toBe(firstPage);
    expect(views.get(9)!.zoom).toBe(zoom);
    expect(scroll.scrollTop).toBe(220);
    view.unmount();
    expect(destroy).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:page-1');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:page-2');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:page-3');
  });

  it('keeps lesson exercises on their existing complete-document render path', async () => {
    const { finish } = delayedDocument();
    render(<PdfPageViewer {...base} progressive renderConcurrency={2} initialPage={3} />);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.queryByRole('img', { name: 'Page 3' })).toBeNull();
    await act(async () => { finish.get(1)!(); finish.get(2)!(); await vi.advanceTimersByTimeAsync(1); });
    // Page 3 is ready, but lesson rendering still waits for the complete set.
    expect(screen.queryByRole('img', { name: 'Page 3' })).toBeNull();
    await act(async () => { finish.get(4)!(); await vi.advanceTimersByTimeAsync(1); });
    await act(async () => { finish.get(5)!(); await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole('img', { name: 'Page 3' })).toBeInTheDocument();
    expect(screen.queryByText('Preparing remaining pages…')).toBeNull();
  });

  it('keeps already prepared pages readable when background preparation times out', async () => {
    const { destroy } = delayedDocument();
    const retry = vi.fn();
    render(<PdfPageViewer {...base} exerciseId={undefined} progressive renderConcurrency={2} initialPage={3} onRetry={retry} />);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByRole('img', { name: 'Page 3' })).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(45_000));
    expect(screen.getByRole('img', { name: 'Page 3' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Some pages took too long');
    expect(screen.queryByRole('status')).toBeNull();
    expect(destroy).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry PDF' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

it('reuses the open document for native text and retains page-level matches if text positioning is unavailable', async () => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  const text = vi.fn(async () => ({ items: [{ str: 'Quadratic equations' }], styles: {} }));
  h.getDocument.mockReturnValue({ destroy: vi.fn(async () => {}), promise: Promise.resolve({ numPages: 1, destroy: vi.fn(), getPage: async () => ({
    getTextContent: text, getViewport: () => ({ width: 600, height: 800 }), render: () => ({ promise: Promise.resolve() }),
  }) }) });
  const terms = [{ text: 'quadratic' }];
  const view = render(<PdfPageViewer {...base} exerciseId={undefined} progressive searchTerms={terms} initialPage={1} />);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(h.getDocument).toHaveBeenCalledOnce(); expect(text).toHaveBeenCalledOnce();
  expect(screen.getByRole('img', { name: 'Page 1' })).toBeInTheDocument();
  // This mocked runtime has no TextLayer, so the user receives an honest fallback.
  expect(screen.getByRole('group', { name: 'PDF text matches' })).toHaveTextContent('1 of 1 matches · page only');
  view.rerender(<PdfPageViewer {...base} exerciseId={undefined} progressive searchTerms={[{ text: 'equations' }]} initialPage={1} />);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(h.getDocument).toHaveBeenCalledOnce(); expect(text).toHaveBeenCalledOnce();
  view.unmount(); delete (HTMLElement.prototype as unknown as { scrollTo?: unknown }).scrollTo;
});

it('does not claim the PDF has no matches when native text extraction failed on another page', async () => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  h.getDocument.mockReturnValue({ destroy: vi.fn(async () => {}), promise: Promise.resolve({ numPages: 2, destroy: vi.fn(), getPage: async (number: number) => ({
    getTextContent: async () => { if (number === 2) throw new Error('Text unavailable'); return { items: [{ str: 'Unrelated text' }], styles: {} }; },
    getViewport: () => ({ width: 600, height: 800 }), render: () => ({ promise: Promise.resolve() }),
  }) }) });
  const view = render(<PdfPageViewer {...base} exerciseId={undefined} progressive searchTerms={[{ text: 'quadratic' }]} initialPage={1} />);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(screen.getByRole('group', { name: 'PDF text matches' })).toHaveTextContent('Precise highlighting unavailable');
  expect(screen.queryByText('No matching text in PDF')).toBeNull();
  expect(screen.getByRole('img', { name: 'Page 1' })).toBeInTheDocument();
  view.unmount(); delete (HTMLElement.prototype as unknown as { scrollTo?: unknown }).scrollTo;
});

it('keeps the courseware loading surface through byte fetching and first-page preparation', async () => {
  const { CoursewarePreviewState } = await import('@/components/courseware/CoursewarePreviewState');
  let ready!: (document: unknown) => void;
  const task = documentTask();
  h.getDocument.mockReturnValue({ destroy: vi.fn(async () => {}), promise: new Promise(resolve => { ready = resolve; }) });
  const renderLoading = () => <CoursewarePreviewState />;
  const view = render(<PdfPageViewer {...base} pdfData={null} isLoading renderLoading={renderLoading} />);
  const status = screen.getByRole('status'); expect(status).toHaveTextContent('Opening PDF…');
  view.rerender(<PdfPageViewer {...base} renderLoading={renderLoading} />);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(screen.getByRole('status')).toBe(status);
  expect(screen.queryByText('Rendering pages...')).toBeNull();
  await act(async () => { ready(await task.promise); await vi.advanceTimersByTimeAsync(1); });
  expect(screen.getByRole('img', { name: 'Page 1' })).toBeInTheDocument();
  expect(screen.queryByRole('status')).toBeNull();
});
