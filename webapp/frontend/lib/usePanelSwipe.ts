import { useRef, useCallback } from "react";

/**
 * Hook for edge-swipe-to-dismiss on mobile panels.
 * Detects swipes starting within 30px of the left edge and dismisses
 * the panel with a slide-out animation when dragged past 120px.
 */
export function usePanelSwipe(isMobile: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const swipeState = useRef({ x: 0, y: 0, active: false });

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const x = e.touches[0].clientX;
    if (x > 30) return;
    swipeState.current = { x, y: e.touches[0].clientY, active: false };
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (swipeState.current.x === 0) return;
    const dx = e.touches[0].clientX - swipeState.current.x;
    const dy = e.touches[0].clientY - swipeState.current.y;
    if (!swipeState.current.active && Math.abs(dx) > Math.abs(dy) && dx > 10) {
      swipeState.current.active = true;
    }
    if (!swipeState.current.active || !panelRef.current) return;
    const clamped = Math.max(0, dx);
    panelRef.current.style.transform = `translateX(${clamped}px)`;
    panelRef.current.style.transition = 'none';
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeState.current.active || !panelRef.current) {
      swipeState.current = { x: 0, y: 0, active: false };
      return;
    }
    const dx = e.changedTouches[0].clientX - swipeState.current.x;
    if (dx > 120) {
      panelRef.current.style.transition = 'transform 0.25s ease-out';
      panelRef.current.style.transform = 'translateX(100%)';
      setTimeout(onClose, 250);
    } else {
      panelRef.current.style.transition = 'transform 0.2s ease-out';
      panelRef.current.style.transform = 'translateX(0)';
    }
    swipeState.current = { x: 0, y: 0, active: false };
  }, [onClose]);

  const touchHandlers = isMobile ? { onTouchStart, onTouchMove, onTouchEnd } : {};

  return { panelRef, touchHandlers };
}
