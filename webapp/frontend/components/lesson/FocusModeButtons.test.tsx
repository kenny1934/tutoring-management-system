import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LayoutList } from "lucide-react";
import { FocusSidebarButton, LeaveFocusButton } from "./FocusModeButtons";

describe("the focus mode buttons", () => {
  it("keep their names when they show only their icons", () => {
    const onOpen = vi.fn();
    const onLeave = vi.fn();
    render(
      <>
        <FocusSidebarButton icon={LayoutList} label="Exercises" open={false} onOpen={onOpen} labelClass="sr-only" />
        <LeaveFocusButton onLeave={onLeave} labelClass="sr-only" />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Exercises" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave focus" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
