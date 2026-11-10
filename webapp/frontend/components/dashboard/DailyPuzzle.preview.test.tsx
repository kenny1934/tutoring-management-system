import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DailyPuzzle } from "./DailyPuzzle";
let phone = true;
vi.mock("@/hooks/usePopoverSheet", async importOriginal => ({ ...await importOriginal<object>(), useAsSheet: () => phone }));
vi.mock("@/lib/hooks/useDailyPuzzle", () => ({ useDailyPuzzle: () => ({ question: { question: "Which answer follows?", correctAnswer: "The first complete answer", allAnswers: ["The first complete answer", "The second complete answer"] }, isLoading: false, error: null, userAnswer: null, isCorrect: null, submitAnswer: vi.fn() }) }));

beforeEach(() => { phone = true; window.sessionStorage.clear(); window.history.replaceState({}, "", "/?ui-preview=motion"); });
describe("the dashboard puzzle sheet", () => {
  it("opens as a named phone modal and returns focus and reading position", async () => {
    const main = document.createElement("main"); main.id = "main-content"; document.body.append(main);
    const { unmount } = render(<DailyPuzzle />, { container: main });
    fireEvent.click(screen.getByRole("button", { name: /Daily puzzle:/ }));
    const choose = screen.getByRole("button", { name: "Choose an answer" });
    main.scrollTop = 130;
    fireEvent.click(choose);
    expect(await screen.findByRole("dialog", { name: "Daily puzzle" })).toBeInTheDocument();
    expect(main.inert).toBe(true);
    expect(main).toHaveAttribute("data-native-session-open", "true");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Daily puzzle" })).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(choose));
    expect(main.inert).not.toBe(true);
    expect(main.scrollTop).toBe(130);
    unmount(); main.remove();
  });
  it("uses the phone sheet from a retired Original URL", () => {
    window.history.replaceState({}, "", "/?ui-preview=original");
    const main = document.createElement("main"); main.id = "main-content"; document.body.append(main);
    const { unmount } = render(<DailyPuzzle />, { container: main });
    fireEvent.click(screen.getByRole("button", { name: /Daily puzzle:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Choose an answer" }));
    expect(main).toHaveAttribute("data-native-session-open");
    expect(main.inert).toBe(true);
    unmount(); main.remove();
  });
});
