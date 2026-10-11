import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { MobileBottomSheet } from "./mobile-bottom-sheet";

const sheet = (isOpen: boolean, onClose: () => void) => (
  <MobileBottomSheet isOpen={isOpen} onClose={onClose} title="Exercises">
    <p>Body</p>
  </MobileBottomSheet>
);

describe("MobileBottomSheet", () => {
  it("tells the page once it has slid away after the close button", async () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(sheet(true, onClose));
    fireEvent.click(getByLabelText("Close"));
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("slides away when the page closes it, without calling onClose back", async () => {
    const onClose = vi.fn();
    const { rerender, queryByText } = render(sheet(true, onClose));
    rerender(sheet(false, onClose));
    // Still on screen while it slides down.
    expect(queryByText("Body")).not.toBeNull();
    await waitFor(() => expect(queryByText("Body")).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("draws nothing while closed", () => {
    const { queryByText } = render(sheet(false, vi.fn()));
    expect(queryByText("Body")).toBeNull();
  });
});
