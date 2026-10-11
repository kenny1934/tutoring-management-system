import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shareOrCopy } from "./share";

// jsdom has neither a share sheet nor a coarse pointer, so each test sets up
// the device it is pretending to be.
function pretend({ touch, share }: { touch: boolean; share?: (data: ShareData) => Promise<void> }) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: touch }) as unknown as typeof window.matchMedia;
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
}

describe("shareOrCopy", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });

  it("opens the share sheet on a phone and copies nothing", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    pretend({ touch: true, share });
    expect(await shareOrCopy("hello")).toBe("shared");
    expect(share).toHaveBeenCalledWith({ text: "hello" });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("shares a link as a link", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    pretend({ touch: true, share });
    await shareOrCopy("https://example.com/r", { url: true });
    expect(share).toHaveBeenCalledWith({ url: "https://example.com/r" });
  });

  it("does nothing more when the share sheet is closed without choosing an app", async () => {
    pretend({ touch: true, share: vi.fn().mockRejectedValue(new DOMException("closed", "AbortError")) });
    expect(await shareOrCopy("hello")).toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies when the phone refuses to open the share sheet", async () => {
    pretend({ touch: true, share: vi.fn().mockRejectedValue(new DOMException("too late", "NotAllowedError")) });
    expect(await shareOrCopy("hello")).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("copies on a desktop even when the browser could share", async () => {
    const share = vi.fn();
    pretend({ touch: false, share });
    expect(await shareOrCopy("hello")).toBe("copied");
    expect(share).not.toHaveBeenCalled();
  });
});
