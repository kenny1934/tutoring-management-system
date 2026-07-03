"use client";

import { useMemo, useRef, useState } from "react";
import { Search, X, Loader2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { useCurriculumConcepts, useCurriculumSearch } from "@/lib/hooks";
import {
  ROLE_LABELS,
  conceptDisplayName,
  conceptNameForStream,
  sourcesText,
  stripExtension,
} from "@/lib/curriculum-labels";
import type { CurriculumConceptVocab, CurriculumSearchConcept } from "@/types";

interface Scope {
  school: string;
  grade: string;
  lang_stream?: string | null;
}

interface CurriculumSearchProps {
  /** When the page has a school-grade picked, results carry its evidence. */
  scope: Scope | null;
}

type ActiveQuery =
  | { kind: "concept"; conceptId: number; label: string }
  | { kind: "text"; q: string };

function matchesConcept(c: CurriculumConceptVocab, needle: string): boolean {
  const n = needle.toLowerCase();
  return (
    (c.name_en || "").toLowerCase().includes(n) ||
    (c.name_zh || "").includes(needle) ||
    c.codes.some((code) => code.code.toLowerCase() === n)
  );
}

function evidenceText(c: CurriculumSearchConcept): string | null {
  if (!c.evidence || c.evidence.weeks_observed.length === 0) return null;
  const weeks = c.evidence.weeks_observed;
  const span =
    weeks.length === 1
      ? `week ${weeks[0]}`
      : `weeks ${Math.min(...weeks)} to ${Math.max(...weeks)}`;
  return `Seen in ${span} · ${sourcesText(c.evidence.sources)}`;
}

export function CurriculumSearch({ scope }: CurriculumSearchProps) {
  const { showToast } = useToast();
  const { data: concepts } = useCurriculumConcepts();
  const [input, setInput] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [active, setActive] = useState<ActiveQuery | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const needle = input.trim();
    if (!needle || !concepts) return [];
    return concepts.filter((c) => matchesConcept(c, needle)).slice(0, 8);
  }, [concepts, input]);

  const searchParams = useMemo(() => {
    if (!active) return null;
    const scoped = scope
      ? {
          school: scope.school,
          grade: scope.grade,
          lang_stream: scope.lang_stream || undefined,
        }
      : {};
    return active.kind === "concept"
      ? { concept_id: active.conceptId, ...scoped }
      : { q: active.q, ...scoped };
  }, [active, scope]);

  const { data: results, isLoading } = useCurriculumSearch(searchParams);

  const pickConcept = (c: CurriculumConceptVocab) => {
    const label = conceptDisplayName(c);
    setActive({ kind: "concept", conceptId: c.id, label });
    setInput(label);
    setDropdownOpen(false);
  };

  const submitText = () => {
    const q = input.trim();
    if (!q) return;
    setActive({ kind: "text", q });
    setDropdownOpen(false);
  };

  const clear = () => {
    setInput("");
    setActive(null);
    setDropdownOpen(false);
    inputRef.current?.focus();
  };

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath((p) => (p === path ? null : p)), 2000);
    } catch {
      showToast("Could not copy the path.", "error");
    }
  };

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setDropdownOpen(true);
            if (active) setActive(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitText();
            if (e.key === "Escape") setDropdownOpen(false);
          }}
          onFocus={() => input.trim() && setDropdownOpen(true)}
          onBlur={() => setTimeout(() => setDropdownOpen(false), 120)}
          placeholder="e.g. 803, Factorization or 因式分解"
          aria-label="Search topics"
          className="w-full pl-8 pr-8 py-2 text-sm rounded-lg border border-[#d4a574]/60 dark:border-[#8b6f47] bg-white dark:bg-[#1a1a1a] text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        {(input || active) && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {dropdownOpen && matches.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-[#d4a574]/60 dark:border-[#8b6f47] bg-white dark:bg-[#1a1a1a] shadow-lg overflow-hidden">
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickConcept(c);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-teal-50 dark:hover:bg-teal-900/20"
              >
                <span className="text-xs text-gray-800 dark:text-gray-200 truncate">
                  {conceptDisplayName(c)}
                </span>
                {c.grade && (
                  <span className="text-[9px] px-1 py-px rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 shrink-0">
                    {c.grade}
                  </span>
                )}
                {c.codes.length > 0 && (
                  <span className="text-[9px] text-gray-400 ml-auto shrink-0">
                    {c.codes.map((code) => code.code).join(" · ")}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {active && (
        <div className="mt-2 bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg border-2 border-[#d4a574] dark:border-[#8b6f47] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#d4a574]/40 dark:border-[#8b6f47]/60 bg-gradient-to-r from-teal-50 to-[#fef9f3] dark:from-teal-900/20 dark:to-[#2d2618]">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
              Search results
            </span>
            {scope && (
              <span className="text-[10px] text-gray-400">
                with {scope.school} {scope.grade} evidence
              </span>
            )}
            {isLoading && <Loader2 className="h-3 w-3 animate-spin text-gray-400 ml-auto" />}
          </div>

          {results && results.concepts.length === 0 && !isLoading && (
            <p className="px-4 py-4 text-xs text-gray-500 dark:text-gray-400">
              No matching topics. Try a chapter code or part of the topic name.
            </p>
          )}

          {results && results.concepts.length > 0 && (
            <div className="divide-y divide-[#d4a574]/20 dark:divide-[#8b6f47]/30 max-h-[24rem] overflow-y-auto">
              {results.concepts.map((concept) => (
                <div key={concept.concept_id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-medium text-gray-800 dark:text-gray-200"
                      title={conceptNameForStream(concept, scope?.lang_stream || null)}
                    >
                      {conceptNameForStream(concept, scope?.lang_stream || null)}
                    </span>
                    {concept.concept_grade && (
                      <span className="text-[9px] px-1 py-px rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 shrink-0">
                        {concept.concept_grade}
                      </span>
                    )}
                  </div>
                  {evidenceText(concept) && (
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {evidenceText(concept)}
                    </p>
                  )}
                  {concept.files.length > 0 ? (
                    <div className="mt-1 space-y-0.5">
                      {concept.files.map((file) => (
                        <div
                          key={file.file_path}
                          className="flex items-center gap-1.5 group rounded px-1 py-0.5 hover:bg-teal-50/60 dark:hover:bg-teal-900/10"
                        >
                          <span
                            className="text-[11px] text-gray-700 dark:text-gray-300 truncate flex-1"
                            title={file.file_path}
                          >
                            {stripExtension(file.file_basename)}
                          </span>
                          <span className="text-[9px] px-1 py-px rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 shrink-0">
                            {file.role ? ROLE_LABELS[file.role] || file.role : "Worksheet"}
                          </span>
                          {file.lang && (
                            <span
                              className="text-[9px] px-1 py-px rounded bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 shrink-0"
                              title={file.lang === "e" ? "English version" : "Chinese version"}
                            >
                              {file.lang === "e" ? "EN" : "中"}
                            </span>
                          )}
                          {file.assignment_count > 0 && (
                            <span
                              className="text-[9px] text-gray-400 shrink-0"
                              title={`Assigned ${file.assignment_count} times to ${file.unique_student_count} students`}
                            >
                              {file.assignment_count}×
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => copyPath(file.file_path)}
                            title="Copy the file path to paste into an exercise"
                            className={cn(
                              "p-0.5 rounded shrink-0 transition-colors",
                              copiedPath === file.file_path
                                ? "text-teal-600"
                                : "text-gray-400 hover:text-teal-600 hover:bg-teal-100 dark:hover:bg-teal-900/30"
                            )}
                          >
                            {copiedPath === file.file_path ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      No files mapped to this topic yet.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
