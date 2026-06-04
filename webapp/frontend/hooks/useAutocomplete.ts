import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Headless keyboard/highlight behavior for autocomplete inputs.
 *
 * Owns the bits that are easy to get subtly wrong and were previously
 * copy-pasted across the school-autocomplete inputs: arrow-key navigation
 * (with wrap-around), Enter-to-select, Escape-to-close, resetting the
 * highlight when the query changes, and scrolling the highlighted option
 * into view inside a scrollable dropdown.
 *
 * Presentation (input markup, dropdown styling) stays at the call site —
 * spread `handleKeyDown` on the input, attach `getItemRef(i)` to each option,
 * and use `highlightedIndex` / `setHighlightedIndex` for styling and hover.
 */
export function useAutocomplete<T>({
  items,
  isOpen,
  setOpen,
  onSelect,
  onEnterWithoutHighlight,
  resetKey,
  closeOnSelect = true,
}: {
  /** The currently visible (already filtered) options. */
  items: T[];
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  /** Called when an option is chosen via Enter or click. */
  onSelect: (item: T) => void;
  /** Called when Enter is pressed with no option highlighted (optional). */
  onEnterWithoutHighlight?: () => void;
  /** Highlight resets whenever this value changes (typically the query string). */
  resetKey?: unknown;
  closeOnSelect?: boolean;
}) {
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  // Reset the highlight when the query (or other reset key) changes.
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [resetKey]);

  // Keep the highlighted option visible in a scrollable dropdown.
  useEffect(() => {
    if (highlightedIndex >= 0) {
      itemRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  const selectItem = useCallback(
    (item: T) => {
      onSelect(item);
      if (closeOnSelect) setOpen(false);
      setHighlightedIndex(-1);
    },
    [onSelect, closeOnSelect, setOpen]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        if (!isOpen || items.length === 0) return;
        e.preventDefault();
        setHighlightedIndex((i) => (i + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        if (!isOpen || items.length === 0) return;
        e.preventDefault();
        setHighlightedIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
      } else if (e.key === "Enter") {
        if (isOpen && highlightedIndex >= 0 && highlightedIndex < items.length) {
          e.preventDefault();
          selectItem(items[highlightedIndex]);
        } else {
          onEnterWithoutHighlight?.();
        }
      } else if (e.key === "Escape") {
        setOpen(false);
        setHighlightedIndex(-1);
      }
    },
    [isOpen, items, highlightedIndex, selectItem, onEnterWithoutHighlight, setOpen]
  );

  const getItemRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      itemRefs.current[index] = el;
    },
    []
  );

  return { highlightedIndex, setHighlightedIndex, handleKeyDown, selectItem, getItemRef };
}
