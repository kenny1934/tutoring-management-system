import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Check, Trash2 } from "lucide-react";
import { Button, IconButton, Field, Input, Segmented, CountBadge } from "./index";

describe("Button", () => {
  it("is a plain button by default, so it never submits a form by accident", () => {
    render(<form><Button>Cancel</Button></form>);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute("type", "button");
  });

  it("disables itself and says it's busy while loading", () => {
    const onClick = vi.fn();
    render(<Button variant="primary" loading onClick={onClick}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("colours a status icon without changing the label", () => {
    render(<Button size="sm" icon={Check} iconClassName="text-green-700">Attended</Button>);
    const icon = screen.getByRole("button", { name: "Attended" }).querySelector("svg");
    expect(icon).toHaveClass("text-green-700");
  });
});

describe("IconButton", () => {
  it("is named for screen readers and on hover", () => {
    render(<IconButton label="Delete session" icon={Trash2} tone="danger" />);
    const button = screen.getByRole("button", { name: "Delete session" });
    expect(button).toHaveAttribute("title", "Delete session");
  });
});

describe("Field", () => {
  it("points the label at the control and reads out the error with it", () => {
    render(
      <Field id="date" label="Date" hint="Day and month" error="That date doesn't exist.">
        <Input defaultValue="31/02" />
      </Field>,
    );
    const input = screen.getByLabelText("Date");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("That date doesn't exist.");
    // The hint gives way to the error, so only one message shows.
    expect(screen.queryByText("Day and month")).not.toBeInTheDocument();
  });

  it("describes the control with its hint when there's no error", () => {
    render(
      <Field id="notes" label="Notes" hint="Only tutors see this.">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Notes")).toHaveAccessibleDescription("Only tutors see this.");
  });
});

describe("Segmented", () => {
  it("marks the chosen option and reports a new choice", () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="How to schedule"
        value="book"
        onChange={onChange}
        options={[{ value: "book", label: "Book directly" }, { value: "propose", label: "Propose to tutor" }]}
      />,
    );
    expect(screen.getByRole("button", { name: "Book directly" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Propose to tutor" }));
    expect(onChange).toHaveBeenCalledWith("propose");
  });
});

describe("CountBadge", () => {
  it("hides at zero and caps large counts", () => {
    const { container, rerender } = render(<CountBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<CountBadge count={140} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });
});
