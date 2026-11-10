import { describe, expect, it } from "vitest";
import { inboxId } from "./inbox-link";
describe("Inbox notification IDs", () => {
  it.each([null, "", "0", "-2", "1.5", "1e3", " 12", "9007199254740992", "12/34"])("rejects invalid IDs: %s", value => expect(inboxId(value)).toBeNull());
  it("accepts a safe positive ID", () => expect(inboxId("1234")).toBe(1234));
});
