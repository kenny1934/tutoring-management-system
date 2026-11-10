"use client";

import { useCallback, useEffect, useRef, type RefObject, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { rememberScroll, restoreScroll, type ScrollPlace } from "@/components/material/materialJourney";

const KEY = "csmNotificationReturn";
type ReturnPlace = { url: string; scope: string; top: number; item: string; scroll: ScrollPlace[] };
const returns = new Map<string, ReturnPlace>();
let sequence = 0;

/** The origin history entry owns the return, including after Next remounts the bell. */
export function useNotificationReturn(scope: string, setOpen: (open: boolean) => void, reference?: RefObject<HTMLElement | null>) {
  const pathname = usePathname();
  const listElement = useRef<HTMLDivElement>(null);
  const origin = useRef<{ token: string; url: string; scroll: ScrollPlace[] } | null>(null);
  const pending = useRef<ReturnPlace | null>(null);
  const changeOpen = useCallback((next: boolean) => {
    if (next) {
      const token = `${Date.now()}:${++sequence}`;
      origin.current = { token, url: window.location.href, scroll: document.activeElement instanceof HTMLElement ? rememberScroll(document.activeElement) : [] };
      // Record before the phone overlay adds its own temporary history entry.
      window.history.replaceState({ ...window.history.state, [KEY]: token }, "");
    }
    setOpen(next);
  }, [setOpen]);
  const follow = useCallback((event: MouseEvent<HTMLAnchorElement>, item: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const place = origin.current;
    if (place) {
      returns.set(place.token, { url: place.url, scope, top: listElement.current?.scrollTop ?? 0, item, scroll: place.scroll });
      if (returns.size > 20) returns.delete(returns.keys().next().value!);
    }
    setOpen(false);
  }, [scope, setOpen]);
  useEffect(() => {
    const restore = () => {
      if (reference && !reference.current?.getClientRects().length) return;
      const token = window.history.state?.[KEY];
      const place = returns.get(token);
      if (!place || place.scope !== scope || place.url !== window.location.href) return;
      returns.delete(token); pending.current = place; changeOpen(true);
    };
    restore();
    window.addEventListener("popstate", restore); window.addEventListener("pageshow", restore);
    return () => { window.removeEventListener("popstate", restore); window.removeEventListener("pageshow", restore); };
  }, [scope, pathname, changeOpen, reference]);
  const list = useCallback((element: HTMLDivElement | null) => {
    listElement.current = element;
    if (!element || !pending.current) return;
    const place = pending.current; pending.current = null;
    restoreScroll(place.scroll); element.scrollTop = place.top;
    element.querySelector<HTMLElement>(`[data-notification-item="${place.item}"]`)?.focus({ preventScroll: true });
  }, []);
  return { list, changeOpen, follow };
}
