import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { ABOVE_OVERLAYS_Z, useOverlayLayer } from "./useOverlayLayer";

function Layer({
  name,
  open = true,
  lockScroll = false,
}: {
  name: string;
  open?: boolean;
  lockScroll?: boolean;
}) {
  const { isTopmost, zIndex } = useOverlayLayer(open, { lockScroll });
  return <div data-testid={name} data-topmost={String(isTopmost)} data-z={zIndex} />;
}

const topmost = (name: string) => screen.getByTestId(name).dataset.topmost === "true";
const zOf = (name: string) => Number(screen.getByTestId(name).dataset.z);

describe("useOverlayLayer", () => {
  it("gives a lone overlay the top spot", () => {
    render(<Layer name="only" />);
    expect(topmost("only")).toBe(true);
  });

  it("hands topmost to whichever overlay opened last, and paints it higher", () => {
    render(
      <>
        <Layer name="under" />
        <Layer name="over" />
      </>,
    );
    expect(topmost("under")).toBe(false);
    expect(topmost("over")).toBe(true);
    expect(zOf("over")).toBeGreaterThan(zOf("under"));
  });

  it("gives topmost back when the overlay above closes", () => {
    const { rerender } = render(
      <>
        <Layer name="under" />
        <Layer name="over" />
      </>,
    );
    expect(topmost("under")).toBe(false);

    rerender(
      <>
        <Layer name="under" />
        <Layer name="over" open={false} />
      </>,
    );
    expect(topmost("under")).toBe(true);
  });

  it("reports topmost for an overlay that never joined the stack", () => {
    // Fail-open: not being in the stack must never leave an overlay unable to
    // answer its own Escape.
    render(<Layer name="closed" open={false} />);
    expect(topmost("closed")).toBe(true);
  });

  it("never climbs over the layer reserved for toasts", () => {
    render(
      <>
        <Layer name="a" />
        <Layer name="b" />
        <Layer name="c" />
      </>,
    );
    expect(zOf("c")).toBeLessThan(ABOVE_OVERLAYS_Z);
  });

  it("holds the scroll lock until the last overlay wanting it closes", () => {
    const { rerender, unmount } = render(
      <>
        <Layer name="under" lockScroll />
        <Layer name="over" lockScroll />
      </>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <>
        <Layer name="under" lockScroll />
        <Layer name="over" open={false} lockScroll />
      </>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});

describe("stacked overlays", () => {
  it("closes only the inner modal on Escape", () => {
    const onOuterClose = vi.fn();
    const onInnerClose = vi.fn();
    render(
      <>
        <Modal isOpen onClose={onOuterClose} title="Application">
          body
        </Modal>
        <Modal isOpen onClose={onInnerClose} title="Prospect">
          body
        </Modal>
      </>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onInnerClose).toHaveBeenCalledTimes(1);
    expect(onOuterClose).not.toHaveBeenCalled();
  });

  it("leaves the modal open when a confirm dialog over it is dismissed", () => {
    const onModalClose = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <>
        <Modal isOpen onClose={onModalClose} title="Application">
          body
        </Modal>
        <ConfirmDialog
          isOpen
          onConfirm={() => {}}
          onCancel={onCancel}
          title="Discard unsaved changes?"
          message="You have unsaved edits."
        />
      </>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onModalClose).not.toHaveBeenCalled();

    // With the question answered, Escape belongs to the modal again.
    rerender(
      <>
        <Modal isOpen onClose={onModalClose} title="Application">
          body
        </Modal>
        <ConfirmDialog
          isOpen={false}
          onConfirm={() => {}}
          onCancel={onCancel}
          title="Discard unsaved changes?"
          message="You have unsaved edits."
        />
      </>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onModalClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the page frozen when a stacked modal closes", () => {
    const { rerender } = render(
      <>
        <Modal isOpen onClose={() => {}} title="Application">
          body
        </Modal>
        <Modal isOpen onClose={() => {}} title="Prospect">
          body
        </Modal>
      </>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <>
        <Modal isOpen onClose={() => {}} title="Application">
          body
        </Modal>
        <Modal isOpen={false} onClose={() => {}} title="Prospect">
          body
        </Modal>
      </>,
    );
    expect(document.body.style.overflow).toBe("hidden");
  });
});
