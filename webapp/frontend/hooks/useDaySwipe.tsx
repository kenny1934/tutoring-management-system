"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHaptic } from "@/lib/useHaptic";

// How far a sideways swipe has to go before letting go changes the day.
const THRESHOLD = 72;

/**
 * Swiping sideways across a day's lessons moves to the day before or after,
 * as a phone's own calendar does: right for the day before, left for the day
 * after. An arrow comes in from the edge the day will come from, and fills in
 * once letting go would change the day, with a tick of haptics.
 *
 * Only on a touch screen. A swipe that starts mostly up or down is a scroll
 * and is left alone, and so is one that starts inside something that scrolls
 * sideways itself.
 *
 * @returns the arrow, to render anywhere inside the page.
 */
export function useDaySwipe(
  ref: RefObject<HTMLElement | null>,
  { enabled, onPrevious, onNext }: { enabled: boolean; onPrevious: () => void; onNext: () => void },
) {
  const [drag, setDrag] = useState(0);
  const { trigger } = useHaptic();
  const handlers = useRef({ onPrevious, onNext, trigger });
  handlers.current = { onPrevious, onNext, trigger };

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || !window.matchMedia?.("(pointer: coarse)").matches) return;

    let startX = 0;
    let startY = 0;
    let dx = 0;
    let tracking = false;
    let swiping = false;
    let armed = false;

    const scrollsSideways = (target: EventTarget | null) => {
      for (let node = target as HTMLElement | null; node && node !== el; node = node.parentElement) {
        if (node.scrollWidth > node.clientWidth + 1) {
          const overflow = getComputedStyle(node).overflowX;
          if (overflow === "auto" || overflow === "scroll") return true;
        }
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      tracking = e.touches.length === 1 && !scrollsSideways(e.target);
      swiping = false;
      armed = false;
      dx = 0;
      if (!tracking) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!swiping) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          tracking = false;
          return;
        }
        if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        swiping = true;
      }
      // Once it is a sideways swipe, the list mustn't scroll up and down too.
      e.preventDefault();
      setDrag(dx);
      const nowArmed = Math.abs(dx) >= THRESHOLD;
      if (nowArmed && !armed) handlers.current.trigger("selection");
      armed = nowArmed;
    };

    const onEnd = () => {
      if (swiping && armed) {
        if (dx > 0) handlers.current.onPrevious();
        else handlers.current.onNext();
      }
      tracking = false;
      swiping = false;
      armed = false;
      setDrag(0);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, ref]);

  if (drag === 0) return null;
  const forward = drag < 0;
  const progress = Math.min(1, Math.abs(drag) / THRESHOLD);
  const Icon = forward ? ChevronRight : ChevronLeft;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed top-1/2 z-40 -mt-6 flex h-12 w-12 items-center justify-center rounded-full border shadow-md transition-colors",
        forward ? "right-2" : "left-2",
        progress >= 1 ? "border-primary bg-primary text-white" : "border-line bg-raised text-accent-ink",
      )}
      style={{
        opacity: progress,
        transform: `translateX(${(forward ? 1 : -1) * (1 - progress) * 24}px)`,
      }}
    >
      <Icon className="h-6 w-6" />
    </div>
  );
}
