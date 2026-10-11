import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { usePopoverSheet, PopoverShell } from "./usePopoverSheet";

function Harness({ asSheet, onClose }: { asSheet: boolean; onClose: () => void }) {
  const sheet = usePopoverSheet(asSheet, {}, onClose);
  return (
    <PopoverShell
      sheet={sheet}
      floatingRef={() => {}}
      floatingProps={{}}
      header={<button onClick={sheet.close}>Close</button>}
    >
      <p>Body</p>
    </PopoverShell>
  );
}

// The backdrop is the one element the sheet stretches over the whole screen.
const backdropOf = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(".fixed.inset-0")!;

describe("a popover drawn as a sheet", () => {
  it("stays open when a finger lands on the backdrop, so the tap can't fall through", () => {
    const onClose = vi.fn();
    const { container } = render(<Harness asSheet onClose={onClose} />);
    fireEvent.pointerDown(backdropOf(container));
    expect(backdropOf(container)).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("slides away and then closes on a full tap of the backdrop", async () => {
    const onClose = vi.fn();
    const { container } = render(<Harness asSheet onClose={onClose} />);
    fireEvent.click(backdropOf(container));
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("closes once, however many times it is tapped while sliding away", async () => {
    const onClose = vi.fn();
    const { container, getByText } = render(<Harness asSheet onClose={onClose} />);
    fireEvent.click(getByText("Close"));
    fireEvent.click(backdropOf(container));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the header in the strip that stays at the top as the body scrolls", () => {
    const { getByText } = render(<Harness asSheet onClose={() => {}} />);
    expect(getByText("Close").closest(".sticky")).not.toBeNull();
    expect(getByText("Body").closest(".sticky")).toBeNull();
  });
});

describe("the same popover on a wider screen", () => {
  it("closes at once and draws no backdrop", () => {
    const onClose = vi.fn();
    const { container, getByText } = render(<Harness asSheet={false} onClose={onClose} />);
    expect(backdropOf(container)).toBeNull();
    fireEvent.click(getByText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
