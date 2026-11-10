import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker(windows: object[] = []) {
  const handlers = new Map<string, (event: unknown) => void>();
  const clients = { matchAll: vi.fn().mockResolvedValue(windows), openWindow: vi.fn().mockResolvedValue({}) };
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: { location: { origin: "https://csm.test", port: "" }, addEventListener: (name: string, fn: (e: unknown) => void) => handlers.set(name, fn) },
    clients, URL, setTimeout, clearTimeout,
  });
  const click = async (data: object) => {
    let work!: Promise<unknown>; const close = vi.fn();
    handlers.get("notificationclick")!({ notification: { data, close }, waitUntil: (p: Promise<unknown>) => { work = p; } });
    await work; expect(close).toHaveBeenCalledOnce();
  };
  return { clients, click };
}

describe("Push notification navigation", () => {
  it("opens the payload's conversation and message when no Inbox tab exists", async () => {
    const w = worker(); await w.click({ threadId: 42, messageId: 46, url: "/inbox" });
    expect(w.clients.openWindow).toHaveBeenCalledWith("https://csm.test/inbox?thread=42&message=46");
  });
  it("navigates an existing Inbox before focusing it", async () => {
    const focus = vi.fn(); const navigate = vi.fn().mockResolvedValue({ focus });
    const w = worker([{ url: "https://csm.test/inbox?thread=1", navigate, focus }]);
    await w.click({ threadId: 42 }); expect(navigate).toHaveBeenCalledWith("https://csm.test/inbox?thread=42"); expect(focus).toHaveBeenCalledOnce(); expect(w.clients.openWindow).not.toHaveBeenCalled();
  });
  it("falls back to a new tab when the old one closes", async () => {
    const w = worker([{ url: "https://csm.test/inbox", navigate: vi.fn().mockRejectedValue(new Error("Closed")) }]);
    await w.click({ threadId: 42 }); expect(w.clients.openWindow).toHaveBeenCalledOnce();
  });
  it("keeps destinations same-origin and rejects unsafe IDs", async () => {
    const w = worker(); await w.click({ url: "https://other.test/inbox", threadId: -1, messageId: "1e3" });
    expect(w.clients.openWindow).toHaveBeenCalledWith("https://csm.test/inbox");
  });
});
