import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { useState } from "react";
import { AxesPanel } from "./AxesPanel";
import { DEFAULT_AXES, type AxesSettings } from "@/lib/axes";

function Harness({ initial = DEFAULT_AXES, onChange = vi.fn(), onPlace = vi.fn(), onClose = vi.fn() }: {
  initial?: AxesSettings;
  onChange?: (settings: AxesSettings) => void;
  onPlace?: () => void;
  onClose?: () => void;
}) {
  const [settings, setSettings] = useState(initial);
  return (
    <AxesPanel
      settings={settings}
      onChange={(next) => {
        onChange(next);
        setSettings(next);
      }}
      onPlace={onPlace}
      onClose={onClose}
    />
  );
}

const section = (axis: "x" | "y") => within(screen.getByRole("region", { name: `${axis} axis` }));
const field = (axis: "x" | "y", name: string) => within(section(axis).getByRole("group", { name }));
const box = (axis: "x" | "y", name: string) => section(axis).getByRole("textbox", { name });

describe("AxesPanel", () => {
  it("shows each axis's settings in the axis's own numbers, with how long it is", () => {
    render(<Harness />);
    expect(box("x", "From")).toHaveValue("-5");
    expect(box("x", "To")).toHaveValue("5");
    expect(box("x", "Scale")).toHaveValue("1");
    expect(section("x").getByRole("combobox", { name: "Numbers" })).toHaveValue("1");
    expect(section("x").getByText("10 cm long")).toBeInTheDocument();
  });

  it("moves an end by one square with its − and + buttons, and each axis by itself", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(field("x", "To").getByRole("button", { name: "One square higher" }));
    expect(box("x", "To")).toHaveValue("6");
    expect(section("x").getByText("11 cm long")).toBeInTheDocument();
    expect(box("y", "To")).toHaveValue("5");

    fireEvent.click(field("y", "From").getByRole("button", { name: "One square lower" }));
    expect(onChange).toHaveBeenLastCalledWith({ x: { ...DEFAULT_AXES.x, to: 6 }, y: { ...DEFAULT_AXES.y, from: -6 } });
  });

  it("keeps 0 on the axis, greying out the button that would leave it", () => {
    render(<Harness initial={{ ...DEFAULT_AXES, x: { ...DEFAULT_AXES.x, from: -1 } }} />);
    const from = field("x", "From");
    fireEvent.click(from.getByRole("button", { name: "One square higher" }));
    expect(box("x", "From")).toHaveValue("0");
    expect(from.getByRole("button", { name: "One square higher" })).toBeDisabled();
  });

  it("keeps the axis the same length when a square is worth more, and shows its new numbers", () => {
    render(<Harness />);
    fireEvent.click(field("x", "Scale").getByRole("button", { name: "Each square worth more" }));
    expect(box("x", "Scale")).toHaveValue("2");
    expect(box("x", "From")).toHaveValue("-10");
    expect(box("x", "To")).toHaveValue("10");
    expect(section("x").getByText("10 cm long")).toBeInTheDocument();
  });

  it("rounds a typed end to a whole number of squares once Enter is pressed", () => {
    render(<Harness />);
    const from = box("y", "From");
    fireEvent.change(from, { target: { value: "-7.4" } });
    // Until Enter, the box shows what's typed.
    expect(from).toHaveValue("-7.4");
    fireEvent.keyDown(from, { key: "Enter" });
    expect(from).toHaveValue("-7");

    // A typed scale goes to the nearest one on the list, and what isn't a number is forgotten.
    const scale = box("y", "Scale");
    fireEvent.change(scale, { target: { value: "3" } });
    fireEvent.blur(scale);
    expect(scale).toHaveValue("2");
    fireEvent.change(scale, { target: { value: "lots" } });
    fireEvent.blur(scale);
    expect(scale).toHaveValue("2");
  });

  it("numbers an axis as picked, and Reset puts every setting back", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(section("y").getByRole("combobox", { name: "Numbers" }), { target: { value: "2" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_AXES, y: { ...DEFAULT_AXES.y, numbers: 2 } });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onChange).toHaveBeenLastCalledWith(DEFAULT_AXES);
    expect(section("y").getByRole("combobox", { name: "Numbers" })).toHaveValue("1");
  });

  it("numbers the x axis in degrees when Degrees is ticked, stepping through 15°, 30°, 45° and 90° a square", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    // Only the x axis can be in degrees.
    expect(section("y").queryByRole("checkbox", { name: "Degrees" })).toBeNull();

    fireEvent.click(section("x").getByRole("checkbox", { name: "Degrees" }));
    expect(box("x", "Scale")).toHaveValue("30°");
    expect(box("x", "From")).toHaveValue("-150°");
    fireEvent.click(field("x", "Scale").getByRole("button", { name: "Each square worth more" }));
    expect(box("x", "Scale")).toHaveValue("45°");
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_AXES, x: { ...DEFAULT_AXES.x, perSquare: 45, degrees: true } });

    fireEvent.click(section("x").getByRole("checkbox", { name: "Degrees" }));
    expect(box("x", "Scale")).toHaveValue("1");
    expect(box("x", "From")).toHaveValue("-5");
  });

  it("goes on to placing from Place the axes, and closes from Cancel", () => {
    const onPlace = vi.fn();
    const onClose = vi.fn();
    render(<Harness onPlace={onPlace} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Place the axes" }));
    expect(onPlace).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a tap elsewhere without the page taking that tap, and leaves a tap on another control to it", () => {
    const onClose = vi.fn();
    render(
      <>
        <Harness onClose={onClose} />
        <button type="button">Red pen</button>
      </>,
    );
    const page = vi.fn();
    document.body.addEventListener("pointerdown", page);
    fireEvent.pointerDown(document.body);
    expect(page).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    document.body.removeEventListener("pointerdown", page);

    const pen = vi.fn();
    const redPen = screen.getByRole("button", { name: "Red pen" });
    redPen.addEventListener("pointerdown", pen);
    fireEvent.pointerDown(redPen);
    expect(pen).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(2);

    // A tap inside the panel leaves it open.
    fireEvent.pointerDown(box("x", "From"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
