import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { useBackToClose } from "./useBackToClose";

function Overlay({ open, onBack }: { open: boolean; onBack: () => void }) {
  useBackToClose(open, onBack);
  return null;
}

const overlayEntry = () => window.history.state?.csmOverlay;

async function goBack() {
  await act(async () => {
    window.history.back();
    await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }));
  });
}

describe("useBackToClose on a touch screen", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: coarse)" }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds an entry when the overlay opens, and back closes it", async () => {
    const onBack = vi.fn();
    render(<Overlay open onBack={onBack} />);
    expect(overlayEntry()).toBeTypeOf("number");
    await goBack();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("closes only the overlay on top", async () => {
    const lower = vi.fn();
    const upper = vi.fn();
    render(
      <>
        <Overlay open onBack={lower} />
        <Overlay open onBack={upper} />
      </>,
    );
    await goBack();
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
  });

  it("takes its entry off when it closes some other way and the page stays", async () => {
    const { rerender } = render(<Overlay open onBack={() => {}} />);
    const id = overlayEntry();
    rerender(<Overlay open={false} onBack={() => {}} />);
    await waitFor(() => expect(overlayEntry()).not.toBe(id), { timeout: 1000 });
  });
});

describe("useBackToClose on a computer", () => {
  it("leaves history alone", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const before = window.history.length;
    render(<Overlay open onBack={() => {}} />);
    expect(window.history.length).toBe(before);
    vi.unstubAllGlobals();
  });
});
