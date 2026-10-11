"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { size } from "@floating-ui/react";
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";

/**
 * Floating UI middleware that keeps a popover inside the screen. It measures
 * the room left between the anchor and the edge of the screen on the side the
 * popover opened, and caps the popover's height at that, so anything longer
 * scrolls inside it instead of running off the top or bottom. Put it after
 * flip and shift, so it measures the side the popover actually ends up on.
 * The floor of 120px stops a popover squeezed against an edge from becoming
 * a sliver; flip has usually moved it to the roomier side by then. A list
 * that should stay short even on a tall screen passes its own cap in pixels.
 */
export function fitToScreen(padding = 8, cap = Infinity) {
  return size({
    padding,
    apply({ availableHeight, elements }) {
      Object.assign(elements.floating.style, {
        maxHeight: `${Math.min(Math.max(availableHeight, 120), cap)}px`,
        overflowY: "auto",
      });
    },
  });
}

/**
 * The classes a popover takes when it is drawn as a sheet. The bottom padding
 * assumes the popover pads its content by 1rem, as most of them do, and adds
 * room for a phone's home bar.
 */
const SHEET_CLASS =
  "w-full rounded-t-2xl rounded-b-none border-x-0 border-b-0 max-h-[85dvh] overflow-y-auto overscroll-contain pb-[calc(1rem+env(safe-area-inset-bottom))]";

/**
 * On a phone, a popover that shows the details of something tapped becomes a
 * sheet along the bottom of the screen. A popover pinned to the tap can run
 * past the top or bottom of a short screen, while the sheet always has most
 * of the screen to scroll in and keeps its buttons near the thumb.
 *
 * This answers whether to draw the sheet. Call it before useFloating, so the
 * popover can leave fitToScreen out when it is a sheet: the sheet sets its own
 * height, and fitToScreen would replace it with the room around the tap.
 *
 * The width is read straight from the window, because these popovers only
 * render once someone has tapped something, and the hook's first answer is
 * always "not a phone". The hook is still there so turning the phone or
 * resizing the window redraws the popover.
 */
export function useAsSheet(): boolean {
  const isMobile = useIsMobile();
  return typeof window !== "undefined" ? window.innerWidth < 768 : isMobile;
}

/** What the sheet on screen lets the popover around it do. */
interface SheetControls {
  close: () => void;
}

export interface PopoverSheet {
  asSheet: boolean;
  /** Where the popover sits. A sheet places itself, so it ignores this. */
  style: CSSProperties;
  sheetClass: string;
  zIndex: number;
  onClose: () => void;
  /**
   * Closes the popover. A sheet slides down first and only then calls
   * onClose, because most pages remove the popover the moment they hear it
   * closed, which would leave nothing on screen to slide. Use it for the
   * close button. Buttons that close the popover on the way to something
   * else can keep calling onClose, since there the page moves on at once.
   */
  close: () => void;
  controls: { current: SheetControls | null };
}

/**
 * What a popover needs to draw itself as a sheet, or as itself. Pair it with
 * PopoverShell, which draws whichever one this says.
 *
 * A sheet closes from a full tap on its backdrop, the close button, or a
 * pull down by its handle or header. The popover should turn off floating-ui's
 * outsidePress while it is a sheet. That fires the moment a finger lands, so
 * the backdrop was gone by the time the finger lifted, and the tap went on to
 * whatever lay beneath it, which on most pages opened another lesson or
 * student.
 */
export function usePopoverSheet(
  asSheet: boolean,
  floatingStyles: CSSProperties,
  onClose: () => void,
  zIndex = 9999,
): PopoverSheet {
  const controls = useRef<SheetControls | null>(null);

  const close = useCallback(() => {
    if (asSheet && controls.current) controls.current.close();
    else onClose();
  }, [asSheet, onClose]);

  return {
    asSheet,
    style: asSheet ? {} : { ...floatingStyles, zIndex },
    sheetClass: SHEET_CLASS,
    zIndex,
    onClose,
    close,
    controls,
  };
}

// The sheet rises on a spring that settles without bouncing, and leaves a
// little faster than it came, as sheets on iOS and Android do.
const RISE = { type: "spring", damping: 35, stiffness: 300 } as const;
const FALL = { type: "tween", duration: 0.22, ease: [0.4, 0, 1, 1] } as const;

// How far, or how fast, a pull has to go before letting go closes the sheet.
// A quarter of the sheet's height, capped so a tall sheet doesn't need a long
// pull, or a flick at 500px a second.
const CLOSE_DISTANCE_CAP = 120;
const CLOSE_VELOCITY = 500;

interface PopoverShellProps {
  sheet: PopoverSheet;
  /** floating-ui's refs.setFloating */
  floatingRef: (node: HTMLElement | null) => void;
  /** floating-ui's getFloatingProps() */
  floatingProps: Record<string, unknown>;
  className?: string;
  /**
   * The popover's header, with its close button. On a sheet it sits with the
   * handle in a strip that stays at the top while the rest scrolls under it,
   * and pressing anywhere on that strip picks the sheet up so it can be
   * pulled down to close. A close button placed absolutely sits against
   * the strip, which starts at the sheet's top edge just as the popover does.
   */
  header?: ReactNode;
  /**
   * Whether the popover pads its content by 1rem, as most of them do. The
   * strip stretches past that padding to the edges of the sheet, so it can
   * cover what scrolls under it and be grabbed anywhere along its width, and
   * draws a rule under the header. A popover without padding should give its
   * header a bottom border of its own.
   */
  inset?: boolean;
  children: ReactNode;
}

/**
 * The box a detail popover draws its content in. On a wider screen it is the
 * popover itself, placed by floating-ui. On a phone it is a sheet that slides
 * up from the bottom over a backdrop, with a handle along its top.
 */
export function PopoverShell(props: PopoverShellProps) {
  const { sheet, floatingRef, floatingProps, className, header, children } = props;
  if (sheet.asSheet) return <Sheet {...props} />;
  return (
    <div ref={floatingRef} style={sheet.style} {...floatingProps} className={className}>
      {header}
      {children}
    </div>
  );
}

function Sheet({
  sheet,
  floatingRef,
  floatingProps,
  className,
  header,
  inset = true,
  children,
}: PopoverShellProps) {
  const { zIndex, onClose } = sheet;
  const reduceMotion = useReducedMotion();
  const dragControls = useDragControls();
  const shellRef = useRef<HTMLDivElement | null>(null);

  // The sheet starts below the bottom of the screen and rises from there.
  const y = useMotionValue(
    reduceMotion || typeof window === "undefined" ? 0 : window.innerHeight,
  );
  // The backdrop fades as the sheet is pulled down, so the pull shows how
  // close it is to closing.
  const backdropOpacity = useTransform(y, (value) => {
    const height = shellRef.current?.offsetHeight || window.innerHeight;
    return Math.min(1, Math.max(0, 1 - value / height));
  });

  // Held is from the moment a finger lands on the strip until it lifts. It
  // drives the highlight that shows the sheet is in hand.
  const [held, setHeld] = useState(false);
  // Once the content has scrolled under the strip, the strip casts a shadow
  // to show there is more above.
  const [scrolled, setScrolled] = useState(false);
  const closing = useRef(false);
  // A pull that ends over a link or button in the strip must not count as a
  // tap on it, so the click that follows the pull is swallowed.
  const dragged = useRef(false);

  useEffect(() => {
    if (!reduceMotion) animate(y, 0, RISE);
  }, [reduceMotion, y]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (reduceMotion) {
      onClose();
      return;
    }
    const height = shellRef.current?.offsetHeight || window.innerHeight;
    animate(y, height, FALL).then(onClose);
  }, [onClose, reduceMotion, y]);

  useEffect(() => {
    sheet.controls.current = { close };
    return () => {
      sheet.controls.current = null;
    };
  }, [sheet.controls, close]);

  const grab = (event: ReactPointerEvent<HTMLElement>) => {
    if (closing.current) return;
    setHeld(true);
    const release = () => {
      setHeld(false);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    dragControls.start(event);
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const height = shellRef.current?.offsetHeight || window.innerHeight;
    const distance = Math.min(height / 4, CLOSE_DISTANCE_CAP);
    if (info.offset.y > distance || info.velocity.y > CLOSE_VELOCITY) close();
  };

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      shellRef.current = node;
      floatingRef(node);
    },
    [floatingRef],
  );

  return (
    <>
      {/* A full tap closes the sheet, so the finger lifts on the backdrop and
          the click can't reach whatever is under it. The backdrop stays while
          the sheet slides away, to catch taps made in that moment too. */}
      <motion.div
        className="fixed inset-0 bg-black/40"
        style={{ zIndex, opacity: backdropOpacity }}
        onClick={close}
        aria-hidden="true"
      />
      <motion.div
        ref={setRefs}
        {...floatingProps}
        className={className}
        style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex, y }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        // The sheet follows the finger all the way down, but not up, and
        // springs back without bouncing when a pull is let go too early.
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        dragTransition={{ bounceStiffness: 400, bounceDamping: 40 }}
        onDragStart={() => {
          dragged.current = true;
        }}
        onDragEnd={onDragEnd}
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
        onPointerDownCapture={(event: ReactPointerEvent<HTMLDivElement>) => {
          dragged.current = false;
          // floating-ui listens here too, to tell a press inside from one outside.
          (floatingProps.onPointerDownCapture as ((e: ReactPointerEvent) => void) | undefined)?.(event);
        }}
        onClickCapture={(event) => {
          if (!dragged.current) return;
          dragged.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {/* The strip is sticky inside the sheet, which is the box that
            scrolls. touch-action: none stops the browser reading a pull on
            it as a scroll.

            A padded popover's strip draws a rule along its bottom, with the
            header's own bottom margin above it and the same gap below it
            before the body starts. Without the rule nothing shows where the
            header ends, so anything scrolling under it looks cut off. The
            rule also keeps the header's margin inside the strip; with
            nothing at the strip's bottom edge, the margin would fall outside
            it and the body would reach the header after only 12px of
            scrolling. A popover without padding draws its header's edge
            itself, as the student popover does.

            A sticky element stops at the inside of the scrolling box's
            padding, not at its outer edge. So a padded strip sticks at -1rem,
            or it would rest 1rem below the sheet's top edge: over the top of
            the body before any scrolling, and with content showing above it
            after.

            The strip takes the sheet's own background colour, so content
            scrolling under it is hidden whatever colour the sheet is. */}
        <div
          className={cn(
            "sticky z-10 bg-inherit transition-shadow duration-150",
            inset ? "-top-4 -mx-4 -mt-4 mb-3 px-4 border-b border-line" : "top-0",
            scrolled && "shadow-[0_6px_8px_-6px_rgb(0_0_0/0.25)]",
          )}
          style={{ touchAction: "none" }}
          onPointerDown={grab}
        >
          {/* The highlight while the strip is held. It sits under the strip's
              content, so it tints the paper and not the text. */}
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 -z-10 bg-ink-strong/10 transition-opacity duration-150",
              held ? "opacity-100" : "opacity-0",
            )}
          />
          <div aria-hidden="true" className="flex justify-center pt-3 pb-2">
            <div
              className={cn(
                "h-1 rounded-full transition-all duration-150",
                held ? "w-14 bg-ink-subtle" : "w-10 bg-ink-subtle/40",
              )}
            />
          </div>
          {header}
        </div>
        {children}
      </motion.div>
    </>
  );
}
