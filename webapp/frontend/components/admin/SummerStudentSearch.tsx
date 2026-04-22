"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getGradeColor } from "@/lib/constants";

export interface SummerStudentSearchEntry {
  applicationId: number;
  name: string;
  grade: string;
  langStream?: string | null;
  /** Displayed as a small mono badge (e.g. school_student_id or
   *  primary_student_id) when available. Already folded into `haystack`. */
  studentId?: string | null;
  placed: boolean;
  firstLesson?: {
    lessonDate: string;
    sessionId: number | null;
  } | null;
  /** Pre-lowercased haystack (name + phone digits + student id) assembled by
   * the parent so matching stays cheap inside the dropdown filter loop. Phone
   * is digit-only, so queries like "5521" or "9123 4567" both match after the
   * component digit-normalizes numeric queries. */
  haystack: string;
}

interface SummerStudentSearchProps {
  entries: SummerStudentSearchEntry[];
  onSelect: (entry: SummerStudentSearchEntry) => void;
  placeholder?: string;
  className?: string;
}

const MAX_RESULTS = 10;

export function SummerStudentSearch({
  entries,
  onSelect,
  placeholder = "Find student...",
  className,
}: SummerStudentSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const raw = query.trim().toLowerCase();
    if (!raw) return [];
    // If the query is mostly digits (phone-ish), strip formatting so "9123 4567"
    // and "9123-4567" both hit the digit-only phone token in haystack.
    const digitsOnly = raw.replace(/\D+/g, "");
    const isPhoneish = digitsOnly.length >= 3 && digitsOnly.length / raw.length >= 0.6;
    const q = isPhoneish ? digitsOnly : raw;
    const matches: SummerStudentSearchEntry[] = [];
    for (const e of entries) {
      if (e.haystack.includes(q)) {
        matches.push(e);
        if (matches.length >= MAX_RESULTS * 2) break;
      }
    }
    // Placed (with a jump target) surface first — they're the actionable ones.
    matches.sort((a, b) => {
      if (a.placed !== b.placed) return a.placed ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return matches.slice(0, MAX_RESULTS);
  }, [entries, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const handleSelect = useCallback(
    (entry: SummerStudentSearchEntry) => {
      onSelect(entry);
      setQuery("");
      setOpen(false);
      inputRef.current?.blur();
    },
    [onSelect]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (results[activeIdx]) {
        e.preventDefault();
        handleSelect(results[activeIdx]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full pl-7 pr-7 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        aria-label="Search students across placed and unplaced"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            inputRef.current?.focus();
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground rounded"
          title="Clear"
          aria-label="Clear search"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {showDropdown && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-80 overflow-auto"
          role="listbox"
        >
          {results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No students match &ldquo;{query}&rdquo;.
            </div>
          ) : (
            results.map((entry, idx) => (
              <button
                key={entry.applicationId}
                type="button"
                role="option"
                aria-selected={idx === activeIdx}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => handleSelect(entry)}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-sm",
                  idx === activeIdx && "bg-primary/10",
                )}
              >
                <span
                  className="inline-flex items-center justify-center text-[10px] font-semibold px-1.5 py-0.5 rounded text-gray-800 shrink-0"
                  style={{ backgroundColor: getGradeColor(entry.grade, entry.langStream ?? undefined) }}
                >
                  {entry.grade}{entry.langStream ?? ""}
                </span>
                {entry.studentId && (
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                    {entry.studentId}
                  </span>
                )}
                <span className="flex-1 min-w-0 truncate">{entry.name}</span>
                {entry.placed ? (
                  <span className="text-[10px] text-green-600 dark:text-green-400 shrink-0">
                    placed
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    unplaced
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
