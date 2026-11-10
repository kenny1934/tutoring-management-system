import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, waitFor, screen, act } from "@testing-library/react";
import { useState } from "react";
import { flushSync } from "react-dom";
import { Modal } from "@/components/ui/modal";
import { SessionDetailPopover } from "./SessionDetailPopover";

// The popover is rendered in its loading state (no session yet), which runs
// every hook it has without needing a lesson's worth of data. These stand in
// for the contexts and fetches those hooks reach for.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1 }, effectiveRole: "Tutor", impersonatedTutor: null, isReadOnly: false }),
}));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/contexts/ConfirmContext", () => ({ useConfirmOpen: () => false }));
vi.mock("@/lib/hooks", () => ({ useSession: () => ({ data: undefined, isLoading: false }) }));
vi.mock("./EditableLessonNumberBadge", () => ({
  EditableLessonNumberBadge: () => null,
  useSaveLessonNumber: () => vi.fn(),
}));
vi.mock("@/components/homework/useHomeworkMarked", () => ({ useHomeworkMarked: () => vi.fn() }));

const popover = (onClose: () => void) => (
  <SessionDetailPopover session={null} isOpen onClose={onClose} clickPosition={{ x: 0, y: 0 }} />
);

describe("a lesson popover stacked over a modal", () => {
  let removeCatcher: (() => void) | null = null;
  afterEach(() => {
    removeCatcher?.();
    removeCatcher = null;
  });

  it("takes Escape for itself and leaves the modal open", () => {
    const onModalClose = vi.fn();
    const onPopoverClose = vi.fn();
    render(
      <>
        <Modal isOpen onClose={onModalClose} title="Classwork">
          body
        </Modal>
        {popover(onPopoverClose)}
      </>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onPopoverClose).toHaveBeenCalledTimes(1);
    expect(onModalClose).not.toHaveBeenCalled();
  });

  it("does not pass Escape to the payment modal when closing unmounts the popover immediately", () => {
    const onModalClose = vi.fn();
    function Payment() {
      const [open, setOpen] = useState(false);
      return <Modal isOpen onClose={onModalClose} title="Payment">
        <button onClick={() => setOpen(true)}>Open session</button>
        {open && popover(() => flushSync(() => setOpen(false)))}
      </Modal>;
    }
    const view = render(<Payment />);
    fireEvent.click(view.getByRole("button", { name: "Open session" }));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onModalClose).not.toHaveBeenCalled();
    expect(view.getByRole("dialog", { name: "Payment" })).toBeInTheDocument();
  });

  it("still hears Escape when the modal under it catches keys at the window", () => {
    // The exercise modal listens at the window in the capture phase and
    // stops keys there, so nothing listening on the document hears them.
    const catcher = (e: KeyboardEvent) => e.stopPropagation();
    window.addEventListener("keydown", catcher, true);
    removeCatcher = () => window.removeEventListener("keydown", catcher, true);

    const onPopoverClose = vi.fn();
    render(
      <>
        <Modal isOpen onClose={() => {}} title="Classwork">
          body
        </Modal>
        {popover(onPopoverClose)}
      </>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onPopoverClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Escape scoped to the session detail while its desktop exit finishes", async () => {
    const main = document.createElement("main"); main.id = "main-content";
    const row = document.createElement("div"); row.tabIndex = -1; main.append(row); document.body.append(main);
    const onModalClose = vi.fn(), onPopoverClose = vi.fn();
    const { unmount } = render(<><Modal isOpen onClose={onModalClose} title="Classwork">body</Modal><SessionDetailPopover session={null} isOpen onClose={onPopoverClose} clickPosition={{ x: 0, y: 0 }} transitionSource={row} /></>);
    try {
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onPopoverClose).not.toHaveBeenCalled();
      await waitFor(() => expect(onPopoverClose).toHaveBeenCalledTimes(1));
      expect(onModalClose).not.toHaveBeenCalled();
    } finally {
      unmount(); main.remove();
    }
  });

  it("lets a modal over the session detail keep focus and handle Escape", async () => {
    const main = document.createElement("main"); main.id = "main-content";
    const row = document.createElement("div"); row.tabIndex = -1; main.append(row); document.body.append(main);
    const parentClose = vi.fn(), childClose = vi.fn();
    const parent = <SessionDetailPopover session={null} isOpen onClose={parentClose} clickPosition={{ x: 0, y: 0 }} transitionSource={row} />;
    const { rerender, unmount } = render(<>{parent}</>);
    try {
      rerender(<>{parent}<Modal isOpen onClose={childClose} title="Classwork"><button>Save exercise</button></Modal></>);
      const child = screen.getByText("Save exercise"); child.focus();
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      expect(document.activeElement).toBe(child);
      fireEvent.keyDown(child, { key: "Escape" });
      expect(childClose).toHaveBeenCalledTimes(1);
      expect(parentClose).not.toHaveBeenCalled();
    } finally {
      unmount(); main.remove();
    }
  });

  it("leaves Escape to a modal opened over it", () => {
    const onModalClose = vi.fn();
    const onPopoverClose = vi.fn();
    render(
      <>
        {popover(onPopoverClose)}
        <Modal isOpen onClose={onModalClose} title="Classwork">
          body
        </Modal>
      </>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onModalClose).toHaveBeenCalledTimes(1);
    expect(onPopoverClose).not.toHaveBeenCalled();
  });
});
