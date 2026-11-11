import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { NativeDesktopPuzzle } from "./NativeDesktopPuzzle";

afterEach(() => vi.restoreAllMocks());

function size(height: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { x: 0, y: 0, top: 0, left: 0, right: 300, bottom: height, width: 300, height: this.hasAttribute("data-native-puzzle-measure") ? height : 40, toJSON: () => ({}) };
  });
}
function Puzzle() {
  const [answer, setAnswer] = useState<string | null>(null);
  return <NativeDesktopPuzzle question="A real long question" answers={["First answer", "Second answer"]} correctAnswer="First answer" userAnswer={answer} onAnswer={setAnswer}><div>Existing inline puzzle</div></NativeDesktopPuzzle>;
}
describe("desktop puzzle preview", () => {
  it("keeps content inline when its measured height fits", () => {
    size(64);
    render(<Puzzle />);
    expect(screen.queryByRole("button", { name: /Daily puzzle:/ })).not.toBeInTheDocument();
    expect(screen.getByText("Existing inline puzzle").closest("[data-native-puzzle-measure]")).not.toHaveAttribute("aria-hidden");
  });
  it("opens a non-modal full puzzle, shares the answer state and restores trigger focus", async () => {
    size(120);
    render(<Puzzle />);
    const trigger = screen.getByRole("button", { name: /Daily puzzle:/ });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Daily puzzle" });
    expect(dialog).not.toHaveAttribute("aria-modal", "true");
    fireEvent.click(screen.getByRole("button", { name: "First answer" }));
    expect(screen.getByRole("status")).toHaveTextContent("Correct!");
    expect(screen.getByRole("button", { name: "Second answer" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close daily puzzle" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    fireEvent.click(trigger);
    expect(await screen.findByRole("status")).toHaveTextContent("Correct!");
  });
  it("dismisses with Escape without changing the inline content", async () => {
    size(120);
    render(<Puzzle />);
    fireEvent.click(screen.getByRole("button", { name: /Daily puzzle:/ }));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Existing inline puzzle")).toBeInTheDocument();
  });
});
