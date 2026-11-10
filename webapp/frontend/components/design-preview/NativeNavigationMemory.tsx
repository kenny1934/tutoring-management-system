"use client";

import { createContext, Suspense, useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, useState, useCallback, type Dispatch, type SetStateAction, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { getAppScroller } from "@/lib/scroll";
import { NativeNavigationMemory, nativePageKey, nativeSessionsHref } from "./nativeNavigationMemory";
import { LessonResumeProvider } from "./LessonResumeMemory";

const Context = createContext<NativeNavigationMemory | null>(null);
export const useNativeNavigationMemory = () => useContext(Context);
const emptySubscribe = () => () => {};
const emptySnapshot = () => "";

export function useNativeSessionsHref(href: string) {
  const memory = useNativeNavigationMemory();
  const saved = useSyncExternalStore(memory?.subscribe ?? emptySubscribe, memory?.getSessionsHref ?? emptySnapshot, emptySnapshot);
  return memory ? nativeSessionsHref(href, saved) : href;
}

/** Auth/location/view changes create a fresh store, so a previous viewer's selections cannot leak. */
export function NativeNavigationProvider({ children }: { children: ReactNode }) {
  const { user, effectiveRole, isImpersonating, impersonatedTutor, isLoading } = useAuth();
  const { selectedLocation, mounted: locationReady } = useLocation();
  const { viewMode, mounted: roleReady } = useRole();
  const scope = JSON.stringify([user?.id, effectiveRole, isImpersonating ? impersonatedTutor?.id : null, selectedLocation, viewMode]);
  const enabled = Boolean(user);
  const { memory } = useMemo(() => ({ scope, memory: enabled ? new NativeNavigationMemory() : null }), [enabled, scope]);
  const ready = !isLoading && locationReady !== false && roleReady !== false;
  return <Context.Provider value={memory}><LessonResumeProvider scope={enabled && ready ? scope : null} ready={ready}>{children}{memory && <Suspense fallback={null}><NavigationObserver memory={memory} /></Suspense>}</LessonResumeProvider></Context.Provider>;
}

/** UI choices stay in memory, scoped to the authenticated viewer and centre. */
export function useNativeViewState<T>(key: string, initial: () => T): [T, Dispatch<SetStateAction<T>>] {
  const memory = useNativeNavigationMemory();
  const activeKey = memory ? key : "";
  const read = () => {
    const saved = memory?.get<T>(activeKey);
    return saved === undefined ? initial() : saved;
  };
  const [entry, setEntry] = useState(() => ({ memory, key: activeKey, value: read() }));
  let current = entry;
  if (entry.memory !== memory || entry.key !== activeKey) {
    current = { memory, key: activeKey, value: read() };
    setEntry(current);
  }
  const value = current.value;
  useEffect(() => { memory?.set(activeKey, value); }, [memory, activeKey, value]);
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(next => {
    setEntry(previous => ({ ...previous, value: typeof next === "function" ? (next as (value: T) => T)(previous.value) : next }));
  }, []);
  return [value, setValue];
}

/** Returning to a route restores its selection; changing a filter clears it as usual. */
export function useNativeSessionSelection(key: string, location: string) {
  const memory = useNativeNavigationMemory();
  const [selected, setSelected] = useNativeViewState<Set<number>>(`${key}:selection`, () => new Set());
  const last = useRef({ key, location, memory, pop: memory?.pop.generation ?? 0 });
  useEffect(() => {
    const previous = last.current;
    last.current = { key, location, memory, pop: memory?.pop.generation ?? 0 };
    const unchanged = previous.key === key && previous.location === location;
    const restoringHistory = memory && previous.pop !== memory.pop.generation && memory.pop.key === key;
    if (unchanged || (memory && (previous.memory !== memory || restoringHistory))) return;
    setSelected(current => current.size ? new Set() : current);
  }, [key, location, memory, setSelected]);
  return [selected, setSelected] as const;
}

function NavigationObserver({ memory }: { memory: NativeNavigationMemory }) {
  const pathname = usePathname();
  const query = useSearchParams();
  const key = nativePageKey(`${pathname}?${query}`);
  const route = useRef(key);
  const restore = useRef<(() => void) | null>(null);
  const changed = useRef(0);
  const userMoved = useRef(false);

  useEffect(() => {
    const main = getAppScroller(); if (!main) return;
    const onScroll = (event: Event) => {
      if (restore.current || (performance.now() - changed.current < 400 && !userMoved.current)) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const place = memory.getPlace(route.current) ?? { main: 0, inner: {} };
      if (target === main) memory.setPlace(route.current, { main: main.scrollTop, inner: { ...place.inner } });
      else if (target.dataset.nativeScroll) memory.setPlace(route.current, { main: place.main, inner: { ...place.inner, [target.dataset.nativeScroll]: target.scrollTop } });
    };
    const tookOver = () => { userMoved.current = true; restore.current?.(); };
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable=true]")) return;
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) tookOver();
    };
    const pop = () => memory.notePop(window.location.href);
    main.addEventListener("scroll", onScroll, { capture: true, passive: true });
    main.addEventListener("touchstart", tookOver, { passive: true }); main.addEventListener("wheel", tookOver, { passive: true });
    main.addEventListener("keydown", keyDown);
    window.addEventListener("popstate", pop);
    return () => { main.removeEventListener("scroll", onScroll, true); main.removeEventListener("touchstart", tookOver); main.removeEventListener("wheel", tookOver); main.removeEventListener("keydown", keyDown); window.removeEventListener("popstate", pop); };
  }, [memory, pathname]);

  useLayoutEffect(() => {
    const previousPath = route.current.split("?")[0];
    route.current = key; changed.current = performance.now(); userMoved.current = false; restore.current?.();
    if (pathname === "/sessions") memory.rememberSessions(key);
    const main = getAppScroller(), place = memory.getPlace(key);
    if (!main || (pathname !== "/" && pathname !== "/sessions")) return;
    if (!place) {
      if (previousPath !== pathname) main.scrollTop = 0;
      return;
    }
    let stopped = false, frame = 0;
    const pending = new Set(Object.keys(place.inner));
    let mainDone = false;
    const deadline = performance.now() + 6000;
    const stop = () => {
      stopped = true; cancelAnimationFrame(frame); observer.disconnect(); clearInterval(timer);
      if (restore.current === stop) restore.current = null;
    };
    const apply = () => {
      frame = 0; if (stopped || userMoved.current || route.current !== key) return stop();
      if (!mainDone && main.scrollHeight - main.clientHeight >= place.main - 1) { main.scrollTop = place.main; mainDone = true; }
      for (const node of main.querySelectorAll<HTMLElement>("[data-native-scroll]")) {
        const name = node.dataset.nativeScroll!; if (!pending.has(name)) continue;
        if (node.scrollHeight - node.clientHeight >= place.inner[name] - 1) { node.scrollTop = place.inner[name]; pending.delete(name); }
      }
      if ((mainDone && !pending.size) || performance.now() >= deadline) stop();
    };
    const schedule = () => { if (!stopped && !frame) frame = requestAnimationFrame(apply); };
    const observer = new MutationObserver(schedule); observer.observe(main, { childList: true, subtree: true });
    const timer = setInterval(schedule, 100); restore.current = stop; schedule();
    return stop;
  }, [key, memory, pathname]);
  return null;
}
