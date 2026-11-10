import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_FILTER, StatusFilterDropdown } from "./StatusFilterDropdown";

function Filter({ initial = "", changed = () => {} }: { initial?: string; changed?: (value: string) => void }) {
  const [value, setValue] = useState(initial);
  return <StatusFilterDropdown compactDefaultLabel value={value} onChange={next => { changed(next); setValue(next); }} />;
}
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => vi.restoreAllMocks());

describe("session status filter", () => {
  it("opens at the selected status, selects with the keyboard and returns focus", async () => {
    const user = userEvent.setup(), changed = vi.fn();
    render(<Filter initial="Attended" changed={changed} />);
    const trigger = screen.getByRole("combobox", { name: "Status: Attended" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(screen.getByRole("listbox", { name: "Session status" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(15);
    await waitFor(() => expect(screen.getByRole("option", { name: "Attended" })).toHaveFocus());
    await user.keyboard("{ArrowDown}{Enter}");
    expect(changed).toHaveBeenCalledWith("Attended (Make-up)");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(screen.getByRole("combobox", { name: "Status: Attended (Make-up)" })).toHaveFocus();
  });

  it("finds long statuses by typing, while Escape preserves the existing filter", async () => {
    const user = userEvent.setup(), changed = vi.fn();
    render(<Filter initial="Scheduled" changed={changed} />);
    const trigger = screen.getByRole("combobox", { name: "Status: Scheduled" });
    await user.click(trigger);
    await user.keyboard("wea");
    await waitFor(() => expect(screen.getByRole("option", { name: "Weather Cancelled - Pending Make-up" })).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(changed).not.toHaveBeenCalled(); expect(trigger).toHaveFocus();
  });

  it("keeps the Active composite value and clears it through All statuses", async () => {
    const user = userEvent.setup(), changed = vi.fn();
    render(<Filter changed={changed} />);
    await user.click(screen.getByRole("combobox", { name: "Status: All statuses" }));
    await user.click(screen.getByRole("option", { name: "Active" }));
    expect(changed).toHaveBeenLastCalledWith(ACTIVE_FILTER);
    const active = screen.getByRole("combobox", { name: "Status: Active" });
    expect(active).toHaveAttribute("data-native-filter-active", "true");
    await user.click(active);
    expect(screen.getByRole("option", { name: "Active" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("option", { name: "All statuses" }));
    expect(changed).toHaveBeenLastCalledWith("");
    expect(screen.getByRole("combobox", { name: "Status: All statuses" })).not.toHaveAttribute("data-native-filter-active");
  });
});
