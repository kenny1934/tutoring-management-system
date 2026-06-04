"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Stack of open modals (innermost last) so that when one modal is opened from
// within another (e.g. the worksheet preview launched from the record picker),
// Escape only closes the topmost one, not both at once.
const modalStack: symbol[] = [];

type Options = {
  /** Close the modal. Fired on Escape, and on a backdrop click when pristine. */
  onClose: () => void;
  /** When false, a backdrop click is ignored so unsaved input isn't discarded.
   *  Defaults to true (backdrop always closes). */
  isPristine?: boolean;
  /** Element to focus on open. Falls back to the first focusable element in
   *  the dialog, then the dialog container itself. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** When false, skip all modal focus management (auto-focus, focus-trap,
   *  focus-restore) and Escape-to-close. Use when the same content renders as a
   *  non-modal docked panel beside live page content rather than as an overlay,
   *  so focus isn't trapped in or stolen by the panel. Defaults to true. */
  enabled?: boolean;
};

/**
 * Shared modal accessibility: Escape-to-close, focus-into-dialog on open with
 * focus-restore on close, and a Tab focus-trap. Mount the hook only while the
 * modal is open (i.e. render the modal conditionally).
 *
 *   const { dialogRef, onKeyDownTrap, onBackdropClick } = useModalA11y({ onClose, isPristine });
 *   <div onClick={onBackdropClick}>
 *     <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="…"
 *          tabIndex={-1} onKeyDown={onKeyDownTrap} onClick={(e) => e.stopPropagation()}>
 */
export function useModalA11y({
  onClose,
  isPristine = true,
  initialFocusRef,
  enabled = true,
}: Options) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Read the latest onClose without re-running the mount-only effect.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    const token = Symbol("modal");
    modalStack.push(token);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const target =
      initialFocusRef?.current ??
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      dialogRef.current;
    target?.focus();

    function onEsc(e: KeyboardEvent) {
      // Only the topmost modal reacts, so a stacked preview closes on its own.
      if (e.key === "Escape" && modalStack[modalStack.length - 1] === token) {
        onCloseRef.current();
      }
    }
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("keydown", onEsc);
      const i = modalStack.lastIndexOf(token);
      if (i !== -1) modalStack.splice(i, 1);
      previouslyFocused?.focus?.();
    };
    // Mount-only: refs cover late values; onClose is read via onCloseRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKeyDownTrap(e: ReactKeyboardEvent) {
    if (e.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const focusable = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onBackdropClick() {
    if (isPristine) onClose();
  }

  return { dialogRef, onKeyDownTrap, onBackdropClick };
}
