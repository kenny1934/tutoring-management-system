import { useSyncExternalStore } from "react";

/**
 * A setting kept in localStorage and shared by every component that reads it,
 * so changing it in one place updates them all at once. A change in another
 * tab reaches this one too. `get` reads it outside React, which is how the PDF
 * export knows whether the Draft is squared.
 *
 * `parse` turns the stored string back into a value. It receives null when
 * nothing has been stored yet, or when storage can't be read, and should
 * return the fallback in that case.
 */
export function createPreference<T>(
  storageKey: string,
  parse: (stored: string | null) => T,
  serialise: (value: T) => string,
) {
  const listeners = new Set<() => void>();
  let current: { value: T } | null = null;

  function get(): T {
    if (current === null) {
      let stored: string | null = null;
      try { stored = localStorage.getItem(storageKey); } catch { /* private window */ }
      current = { value: parse(stored) };
    }
    return current.value;
  }

  function set(value: T) {
    current = { value };
    try { localStorage.setItem(storageKey, serialise(value)); } catch { /* private window */ }
    listeners.forEach((listener) => listener());
  }

  // One listener for the other tabs' changes, there while anything is subscribed.
  function onStorage(e: StorageEvent) {
    if (e.key !== storageKey) return;
    current = { value: parse(e.newValue) };
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

  function usePreference(): [value: T, set: (value: T) => void] {
    return [useSyncExternalStore(subscribe, get, () => parse(null)), set];
  }

  return { get, set, subscribe, usePreference };
}

/**
 * A setting that holds one of a fixed list of choices. Anything else found in
 * storage, such as a choice a later version removed, reads as the fallback.
 */
export function createChoicePreference<T extends string>(
  storageKey: string,
  choices: readonly T[],
  fallback: T,
) {
  return createPreference<T>(
    storageKey,
    (stored) => (choices as readonly string[]).includes(stored ?? "") ? (stored as T) : fallback,
    (value) => value,
  );
}
