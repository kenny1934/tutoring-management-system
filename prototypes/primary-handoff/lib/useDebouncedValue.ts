"use client";

import { useEffect, useState } from "react";

/** Returns `value` delayed by `delayMs`, so rapid changes (e.g. every keystroke
 *  in a search box) settle before triggering expensive downstream work like
 *  rebuilding a filtered checktable. */
export function useDebouncedValue<T>(value: T, delayMs = 150): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
