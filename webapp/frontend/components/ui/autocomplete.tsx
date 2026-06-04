"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useAutocomplete } from "@/hooks/useAutocomplete";

interface AutocompleteProps {
  value: string;
  /** Called as the user types (free-text edits the field). */
  onChange: (value: string) => void;
  /** Raw list of options; filtered internally against `value`. */
  suggestions: string[];
  /** Called when an option is chosen. Defaults to `onChange`. */
  onSelect?: (value: string) => void;
  className?: string;
  placeholder?: string;
  /** Cap the number of options shown (no cap by default). */
  maxSuggestions?: number;
  /** Show all options when the field is empty (default true). */
  showAllWhenEmpty?: boolean;
  /** ms to wait on blur before closing, so a click can register (default 150). */
  blurDelayMs?: number;
  wrapperClassName?: string;
  dropdownClassName?: string;
  itemClassName?: string;
  highlightClassName?: string;
}

const DEFAULT_DROPDOWN =
  "absolute top-full left-0 right-0 mt-1 max-h-32 overflow-y-auto bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded-md shadow-lg z-10";
const DEFAULT_ITEM =
  "w-full px-2 py-1 text-left text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20";
const DEFAULT_HIGHLIGHT = "bg-amber-50 dark:bg-amber-900/20";

/**
 * Text input with a filtered suggestion dropdown and full keyboard support
 * (arrow navigation, Enter to select, Escape to close, scroll-into-view).
 *
 * Styling defaults match the student-detail edit form; pass the `*ClassName`
 * props to retheme it for other surfaces. Behavior lives in `useAutocomplete`.
 */
export function Autocomplete({
  value,
  onChange,
  suggestions,
  onSelect,
  className,
  placeholder,
  maxSuggestions,
  showAllWhenEmpty = true,
  blurDelayMs = 150,
  wrapperClassName = "relative flex-1",
  dropdownClassName = DEFAULT_DROPDOWN,
  itemClassName = DEFAULT_ITEM,
  highlightClassName = DEFAULT_HIGHLIGHT,
}: AutocompleteProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filtered = useMemo(() => {
    const cap = (list: string[]) =>
      maxSuggestions != null ? list.slice(0, maxSuggestions) : list;
    if (!value) return showAllWhenEmpty ? cap(suggestions) : [];
    const q = value.toLowerCase();
    return cap(suggestions.filter((s) => s.toLowerCase().includes(q)));
  }, [suggestions, value, maxSuggestions, showAllWhenEmpty]);

  const { highlightedIndex, setHighlightedIndex, handleKeyDown, selectItem, getItemRef } =
    useAutocomplete<string>({
      items: filtered,
      isOpen: showSuggestions,
      setOpen: setShowSuggestions,
      onSelect: onSelect ?? onChange,
      resetKey: value,
    });

  return (
    <div className={wrapperClassName}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), blurDelayMs)}
        onKeyDown={handleKeyDown}
        className={className}
      />
      {showSuggestions && filtered.length > 0 && (
        <div className={dropdownClassName}>
          {filtered.map((s, i) => (
            <button
              key={s}
              type="button"
              ref={getItemRef(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectItem(s)}
              onMouseEnter={() => setHighlightedIndex(i)}
              className={cn(itemClassName, i === highlightedIndex && highlightClassName)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
