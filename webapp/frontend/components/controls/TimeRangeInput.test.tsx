import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimeRangeInput } from "./TimeRangeInput";
import { parseTimeRange } from "@/lib/time-slots";

function Editor({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <><TimeRangeInput value={value} onChange={setValue} /><output>{value}</output><button disabled={!parseTimeRange(value)}>Save</button></>;
}

describe("custom time controls", () => {
  it("opens an old unspaced value as two clocks", () => {
    render(<Editor initial="18:00-19:30" />);
    expect(screen.getByLabelText("Start time")).toHaveAttribute("type", "time");
    expect(screen.getByLabelText("Start time")).toHaveValue("18:00");
    expect(screen.getByLabelText("End time")).toHaveValue("19:30");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
  it("assembles the separator and blocks incomplete or reversed times", () => {
    render(<Editor />);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "18:00" } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("End time"), { target: { value: "17:00" } });
    expect(save).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("End time must be after start time");
    fireEvent.change(screen.getByLabelText("End time"), { target: { value: "19:30" } });
    expect(save).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("18:00 - 19:30");
    fireEvent.change(screen.getByLabelText("End time"), { target: { value: "" } });
    expect(save).toBeDisabled();
  });
});
