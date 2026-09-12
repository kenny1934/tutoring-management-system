import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InkSaveStatus } from "./InkSaveStatus";

describe("InkSaveStatus", () => {
  it("says where the ink stands in a word or two", () => {
    const { rerender } = render(<InkSaveStatus status="saved" />);
    expect(screen.getByRole("status").textContent).toBe("Saved");
    rerender(<InkSaveStatus status="saving" />);
    expect(screen.getByRole("status").textContent).toBe("Saving…");
    rerender(<InkSaveStatus status="waiting" />);
    expect(screen.getByRole("status").textContent).toBe("Not saved yet");
    rerender(<InkSaveStatus status="offline" />);
    expect(screen.getByRole("status").textContent).toBe("Offline");
  });

  it("shows nothing while the lesson's ink is loading", () => {
    render(<InkSaveStatus status="loading" />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
