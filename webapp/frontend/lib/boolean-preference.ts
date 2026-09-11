import { useSyncExternalStore } from "react";

/**
 * A yes-or-no setting kept in localStorage and shared by every component that
 * reads it, so flipping it in one place updates them all at once. A change in
 * another tab reaches this one too. `get` reads it outside React, which is how
 * the PDF export knows whether the Draft is squared.
 */
export function createBooleanPreference(storageKey: string) {
  const listeners = new Set<() => void>();
  let current: boolean | null = null;

  function get(): boolean {
    if (current === null) {
      try { current = localStorage.getItem(storageKey) === "true"; } catch { current = false; }
    }
    return current;
  }

  function set(value: boolean) {
    current = value;
    try { localStorage.setItem(storageKey, String(value)); } catch { /* private window */ }
    listeners.forEach((listener) => listener());
  }

  // One listener for the other tabs' changes, there while anything is subscribed.
  function onStorage(e: StorageEvent) {
    if (e.key !== storageKey) return;
    current = e.newValue === "true";
    listeners.forEach((listener) => listener());
  }

  function subscribe(listener: () => void) {
    if (listeners.size === 0) window.addEventListener("storage", onStorage);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) window.removeEventListener("storage", onStorage);
    };
  }

  function usePreference(): [value: boolean, set: (value: boolean) => void] {
    return [useSyncExternalStore(subscribe, get, () => false), set];
  }

  return { get, set, usePreference };
}
