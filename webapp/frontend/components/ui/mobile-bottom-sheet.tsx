"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PopoverShell, usePopoverSheet } from "@/hooks/usePopoverSheet";

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  /**
   * A header of the sheet's own, in place of the title and close button,
   * such as the More sheet's profile row. It sits in the strip that stays at
   * the top and that pulls the sheet down, like the title does.
   */
  header?: (close: () => void) => ReactNode;
  className?: string;
}

const NO_FLOATING_STYLES = {};
const noFloatingRef = () => {};

/**
 * A sheet that slides up from the bottom of a phone's screen, for panels
 * that open from a button, such as lesson mode's exercise list.
 *
 * It is drawn by the same sheet as the detail popovers, so it behaves the
 * same way. A full tap on the backdrop, the close button, or a pull down by
 * the handle or the title closes it, and it slides down before it goes.
 *
 * It also slides down when the page closes it itself, as the exercise list
 * does when you pick an exercise. So it stays on screen after isOpen turns
 * false until the slide has finished. When you close it from inside, onClose
 * is called once the slide ends, and not again when the page then sets
 * isOpen to false.
 *
 * It hides itself from tablet width up, so a page can leave it mounted.
 *
 * @example
 * ```tsx
 * <MobileBottomSheet isOpen={isOpen} onClose={() => setIsOpen(false)} title="Details">
 *   <p>Content goes here</p>
 * </MobileBottomSheet>
 * ```
 */
export function MobileBottomSheet({
  isOpen,
  onClose,
  children,
  title,
  header,
  className,
}: MobileBottomSheetProps) {
  // Whether the sheet is on screen, which outlasts isOpen by the length of
  // the slide down.
  const [shown, setShown] = useState(isOpen);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const finish = useCallback(() => {
    setShown(false);
    // Only tell the page when the sheet was closed from inside it.
    if (isOpenRef.current) onClose();
  }, [onClose]);

  const sheet = usePopoverSheet(true, NO_FLOATING_STYLES, finish, 101);

  useEffect(() => {
    if (isOpen) setShown(true);
    else if (shown) sheet.close();
    // Only a change in isOpen should start the sheet sliding in or out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen && !shown) return null;

  return (
    <div className="md:hidden">
      <PopoverShell
        sheet={sheet}
        floatingRef={noFloatingRef}
        floatingProps={NO_FLOATING_STYLES}
        inset={false}
        className={cn(
          "w-full bg-background rounded-t-2xl shadow-2xl",
          "max-h-[85vh] overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]",
          className,
        )}
        header={
          header ? header(sheet.close) : title && (
            <div className="flex items-center justify-between px-4 pb-3 border-b border-line">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button
                onClick={sheet.close}
                className="min-w-[44px] min-h-[44px] p-2.5 -mr-2 rounded-full hover:bg-muted transition-colors flex items-center justify-center"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )
        }
      >
        {children}
      </PopoverShell>
    </div>
  );
}
