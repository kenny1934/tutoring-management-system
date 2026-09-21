import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useOverlayLayer } from "@/hooks/useOverlayLayer";
import ImageLightbox from "@/components/inbox/ImageLightbox";
import { RateSessionModal } from "./RateSessionModal";
import { BulkRateModal } from "./BulkRateModal";
import type { Session } from "@/types";

// Both modals fetch the homework still to check. None of it matters to how
// they share the keyboard with something opened on top.
vi.mock("@/lib/hooks", () => ({ useHomeworkToCheck: () => ({ bySession: new Map() }) }));
vi.mock("@/components/homework/useHomeworkMarked", () => ({ useHomeworkMarked: () => vi.fn() }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const session = { id: 1, student_id: 1, student_name: "Amy", notes: "" } as Session;

/** Anything opened over the modal, such as the Check Viewer or a photo. */
function SomethingOnTop() {
  useOverlayLayer(true);
  return null;
}

describe.each([
  ["the rate modal", () => <RateSessionModal session={session} isOpen onClose={vi.fn()} />],
  ["the bulk rate modal", () => <BulkRateModal sessions={[session]} isOpen onClose={vi.fn()} />],
])("%s", (_name, modal) => {
  it("rates from the number keys", () => {
    render(modal());
    fireEvent.keyDown(document.body, { key: "3" });
    expect(screen.getByText("(3/5)")).toBeInTheDocument();
  });

  it("leaves the rating alone while something is open over it", () => {
    render(
      <>
        {modal()}
        <SomethingOnTop />
      </>,
    );
    fireEvent.keyDown(document.body, { key: "3" });
    expect(screen.queryByText("(3/5)")).not.toBeInTheDocument();
  });

  it("lets a photo of handed-in work opened over it take its own keys", () => {
    const onChangeIndex = vi.fn();
    const onPhotoClose = vi.fn();
    render(
      <>
        {modal()}
        <ImageLightbox images={["a.jpg", "b.jpg"]} currentIndex={0} onClose={onPhotoClose} onChangeIndex={onChangeIndex} />
      </>,
    );
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(onChangeIndex).toHaveBeenCalledWith(1);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onPhotoClose).toHaveBeenCalledTimes(1);
  });
});
