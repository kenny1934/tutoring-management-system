import { useRef, useCallback, useEffect } from "react";

/** Edge swipes leave vertical scrolling alone and cancel cleanly on navigation. */
export function usePanelSwipe(isMobile: boolean, onClose: () => void, options: { reducedMotion?: boolean; managedExit?: boolean } = {}) {
  const { reducedMotion = false, managedExit = false } = options;
  const panelRef = useRef<HTMLDivElement>(null);
  const swipeState = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    swipeState.current = null;
    if (panelRef.current) { panelRef.current.style.transform = ""; panelRef.current.style.transition = ""; }
  }, [isMobile, reducedMotion]);
  const reset = useCallback(() => {
    swipeState.current = null;
    if (panelRef.current) {
      panelRef.current.style.transition = reducedMotion ? "none" : "transform .2s ease-out";
      panelRef.current.style.transform = "translateX(0)";
    }
  }, [reducedMotion]);
  const onTouchStart = useCallback((event: React.TouchEvent) => {
    const touch = event.touches[0];
    swipeState.current = touch.clientX <= 30 ? { x: touch.clientX, y: touch.clientY, active: false } : null;
  }, []);
  const onTouchMove = useCallback((event: React.TouchEvent) => {
    const start = swipeState.current;
    if (!start || !panelRef.current) return;
    const dx = event.touches[0].clientX - start.x, dy = event.touches[0].clientY - start.y;
    if (!start.active && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipeState.current = null; return; }
    if (!start.active && dx > 10 && dx > Math.abs(dy)) start.active = true;
    if (!start.active) return;
    panelRef.current.style.transition = "none";
    panelRef.current.style.transform = `translateX(${Math.max(0, dx)}px)`;
  }, []);
  const onTouchEnd = useCallback((event: React.TouchEvent) => {
    const start = swipeState.current;
    if (!start?.active || !panelRef.current) { swipeState.current = null; return; }
    const dx = event.changedTouches[0].clientX - start.x;
    swipeState.current = null;
    if (dx <= 120) { reset(); return; }
    if (managedExit || reducedMotion) { onClose(); return; }
    panelRef.current.style.transition = "transform .25s ease-out";
    panelRef.current.style.transform = "translateX(100%)";
    closeTimer.current = setTimeout(onClose, 250);
  }, [managedExit, reducedMotion, onClose, reset]);
  const touchHandlers = isMobile ? { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: reset } : {};
  return { panelRef, touchHandlers };
}
