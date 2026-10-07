import { describe, it, expect } from "vitest";
import { lockProblemFrom } from "./document-lock";

// The editor's ApiError carries the HTTP status beside the message.
function apiError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

describe("lockProblemFrom", () => {
  it("names the colleague when the server says someone else holds the lock", () => {
    expect(lockProblemFrom(apiError("Document is locked by Mr David Lee", 409))).toEqual({
      kind: "other",
      name: "Mr David Lee",
    });
  });

  it("says another user when a lost heartbeat comes back without a name", () => {
    expect(lockProblemFrom(apiError("You do not hold the lock on this document", 409))).toEqual({
      kind: "other",
      name: "another user",
    });
  });

  it("treats a dropped connection as offline, never as a person's name", () => {
    expect(lockProblemFrom(new TypeError("Failed to fetch"))).toEqual({ kind: "offline" });
  });

  it("treats a server error as offline", () => {
    expect(lockProblemFrom(apiError("Internal Server Error", 500))).toEqual({ kind: "offline" });
  });
});
