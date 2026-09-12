import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LayoutList } from "lucide-react";
import { FocusModeButtons } from "./FocusModeButtons";

describe("FocusModeButtons", () => {
  it("keeps each button's name when it shows only its icon", () => {
    const onOpenSidebar = vi.fn();
    const onLeave = vi.fn();
    render(
      <FocusModeButtons
        icon={LayoutList}
        label="Exercises"
        sidebarOpen={false}
        onOpenSidebar={onOpenSidebar}
        onLeave={onLeave}
        labelClass="sr-only"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Exercises" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave focus" }));
    expect(onOpenSidebar).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
