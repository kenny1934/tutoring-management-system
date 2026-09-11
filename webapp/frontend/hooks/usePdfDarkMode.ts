"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The lesson viewer's dark PDF mode, as one switch for every viewer on the
 * page. The worksheet and the answer key used to keep a setting each, so the
 * two halves of the board could end up one dark and one light. It's kept in
 * localStorage, and a change in another tab reaches this one too.
 */
const STORAGE_KEY = "csm_pdf_dark_mode";
const listeners = new Set<() => void>();
let current: boolean | null = null;

function read(): boolean {
  if (current === null) {
    try { current = localStorage.getItem(STORAGE_KEY) === "true"; } catch { current = false; }
  }
  return current;
}

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    current = e.newValue === "true";
    notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePdfDarkMode(): [dark: boolean, toggle: () => void] {
  const dark = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => {
    current = !read();
    try { localStorage.setItem(STORAGE_KEY, String(current)); } catch { /* private window */ }
    notify();
  }, []);
  return [dark, toggle];
}
