import { useRef, useCallback } from 'react';

interface SwipeConfig {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;  // minimum px to trigger (default: 80)
}

/**
 * Hook for detecting horizontal swipe gestures on touch devices.
 * Returns touch event handlers to attach to a component.
 *
 * @example
 * const swipeHandlers = useSwipeGesture({
 *   onSwipeRight: () => handleClose(),
 *   threshold: 80,
 * });
 * <div {...swipeHandlers}>...</div>
 */
export function useSwipeGesture(config: SwipeConfig) {
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const isSwiping = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    // Only consider it a swipe if horizontal movement > vertical
    // This prevents conflicts with scrolling
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      isSwiping.current = true;
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isSwiping.current) return;

    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const threshold = config.threshold ?? 80;

    if (deltaX > threshold && config.onSwipeRight) {
      config.onSwipeRight();
    } else if (deltaX < -threshold && config.onSwipeLeft) {
      config.onSwipeLeft();
    }
  }, [config]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
