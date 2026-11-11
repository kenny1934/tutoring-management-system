import { describe, expect, it, vi } from "vitest";
const search = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({ api: { paperless: { search } } }));
import { searchPaperlessByPath } from "./paperless-utils";

describe("cancelled worksheet searches", () => {
  it("stops the fallback cascade after an aborted request", async () => {
    const controller = new AbortController();
    search.mockImplementation(async () => { controller.abort(); throw new DOMException("Aborted", "AbortError"); });
    await expect(searchPaperlessByPath("Algebra\\A.pdf", undefined, controller.signal)).rejects.toThrow();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("Algebra\\A.pdf", 1, "all", undefined, "all", 0, controller.signal);
  });
});
