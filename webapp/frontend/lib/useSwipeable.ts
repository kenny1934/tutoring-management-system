import { useRef, useCallback } from "react";

interface UseSwipeableOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** Minimum distance (px) to trigger action. Default: 60 */
  threshold?: number;
  /** Max swipe distance (px). Default: 80 */
  maxDistance?: number;
  /** Opacity fade distance (px). Default: 60 */
  fadeDistance?: number;
  /** Spring-back transition. Default: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' */
  springTransition?: string;
}

export function useSwipeable({
  onSwipeLeft,
  onSwipeRight,
  threshold = 60,
  maxDistance = 80,
  fadeDistance = 60,
  springTransition = "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
}: UseSwipeableOptions) {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const isSwiping = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const leftIconRef = useRef<HTMLDivElement>(null);
  const rightIconRef = useRef<HTMLDivElement>(null);

  const minX = onSwipeLeft ? -maxDistance : 0;
  const maxX = onSwipeRight ? maxDistance : 0;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentX.current = 0;
    isSwiping.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (!isSwiping.current && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      isSwiping.current = true;
    }
    if (!isSwiping.current) return;
    currentX.current = Math.max(minX, Math.min(maxX, dx));
    if (containerRef.current) {
      containerRef.current.style.transform = `translateX(${currentX.current}px)`;
      containerRef.current.style.transition = "none";
    }
    const opacity = Math.min(1, Math.abs(currentX.current) / fadeDistance);
    if (currentX.current < 0 && leftIconRef.current) leftIconRef.current.style.opacity = String(opacity);
    if (currentX.current > 0 && rightIconRef.current) rightIconRef.current.style.opacity = String(opacity);
  }, [minX, maxX, fadeDistance]);

  const handleTouchEnd = useCallback(() => {
    if (!containerRef.current) return;
    containerRef.current.style.transition = springTransition;
    containerRef.current.style.transform = "translateX(0)";
    if (leftIconRef.current) leftIconRef.current.style.opacity = "0";
    if (rightIconRef.current) rightIconRef.current.style.opacity = "0";

    if (isSwiping.current) {
      if (currentX.current < -threshold && onSwipeLeft) onSwipeLeft();
      else if (currentX.current > threshold && onSwipeRight) onSwipeRight();
    }
    isSwiping.current = false;
    currentX.current = 0;
  }, [onSwipeLeft, onSwipeRight, threshold, springTransition]);

  return {
    containerRef,
    leftIconRef,
    rightIconRef,
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
