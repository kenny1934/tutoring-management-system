import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePdfCover } from "./usePdfCover";
const mocks = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("@/lib/pdf-utils", () => ({ getPdfJs: async () => ({ getDocument: mocks.getDocument }) }));
function file(promise = Promise.resolve()) {
  const render = { promise, cancel: vi.fn() };
  const loading = { promise: Promise.resolve({ getPage: async () => ({ getViewport: () => ({ width: 240, height: 320 }), render: () => render }) }), destroy: vi.fn().mockResolvedValue(undefined) };
  return { render, loading };
}
beforeEach(() => {
  mocks.getDocument.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/webp;base64,cover");
});
afterEach(() => vi.restoreAllMocks());
describe("covers of already opened PDFs", () => {
  it("never loads a remote or unopened file", async () => {
    const view = renderHook(({ url }) => usePdfCover(url), { initialProps: { url: null as string | null } });
    view.rerender({ url: "https://example.test/unopened.pdf" });
    await act(async () => {});
    expect(mocks.getDocument).not.toHaveBeenCalled();
    expect(view.result.current).toBeNull();
  });
  it("renders the open blob and releases its PDF document", async () => {
    const pdf = file(); mocks.getDocument.mockReturnValue(pdf.loading);
    const view = renderHook(({ url }) => usePdfCover(url, "selected-file"), { initialProps: { url: "blob:opened" as string | null } });
    await waitFor(() => expect(view.result.current?.image).toBe("data:image/webp;base64,cover"));
    expect(mocks.getDocument).toHaveBeenCalledWith("blob:opened");
    expect(pdf.loading.destroy).toHaveBeenCalled();
    view.rerender({ url: null });
    expect(view.result.current?.source).toBe("selected-file");
    expect(view.result.current?.image).toBe("data:image/webp;base64,cover");
  });
  it("cancels stale work and never shows its image for the next file", async () => {
    let finish!: () => void;
    const old = file(new Promise<void>(resolve => { finish = resolve; })), next = file();
    mocks.getDocument.mockReturnValueOnce(old.loading).mockReturnValueOnce(next.loading);
    const view = renderHook(({ url }) => usePdfCover(url), { initialProps: { url: "blob:first" } });
    await waitFor(() => expect(mocks.getDocument).toHaveBeenCalledOnce());
    view.rerender({ url: "blob:second" });
    expect(view.result.current).toBeNull();
    await waitFor(() => expect(view.result.current?.image).toBe("data:image/webp;base64,cover"));
    await act(async () => finish());
    expect(old.render.cancel).toHaveBeenCalled();
    view.rerender({ url: "blob:third" });
    expect(view.result.current).toBeNull();
  });
  it("keeps the file fallback usable when a thumbnail cannot render", async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.reject(new Error("Unreadable PDF")), destroy: vi.fn().mockResolvedValue(undefined) });
    const view = renderHook(() => usePdfCover("blob:unreadable"));
    await act(async () => {});
    expect(view.result.current).toBeNull();
  });
});
