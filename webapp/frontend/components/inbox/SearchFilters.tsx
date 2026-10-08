"use client";

import React from "react";
import { X, Paperclip } from "lucide-react";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";
import { cn } from "@/lib/utils";
import type { SearchFilters as SearchFiltersType } from "@/lib/hooks";
import type { Tutor } from "@/types";

interface SearchFiltersProps {
  filters: SearchFiltersType;
  onChange: (filters: SearchFiltersType) => void;
  tutors: Tutor[];
}

const PRIORITIES = ["Normal", "High", "Urgent"] as const;

export default function SearchFilters({ filters, onChange, tutors }: SearchFiltersProps) {
  const hasAny = !!(filters.from_tutor_id || filters.date_from || filters.date_to || filters.has_attachments || filters.priority);

  return (
    <div className="px-3 py-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {/* Sender filter */}
        <select
          value={filters.from_tutor_id || ""}
          onChange={(e) => onChange({ ...filters, from_tutor_id: e.target.value ? Number(e.target.value) : undefined })}
          aria-label="Sender"
          className="text-xs px-2 py-1 border border-field rounded-full bg-transparent text-gray-500 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
        >
          <option value="" className="bg-white dark:bg-[#352e26] text-gray-900 dark:text-gray-100">Any sender</option>
          {[...tutors].sort((a, b) => getTutorSortName(a.tutor_name).localeCompare(getTutorSortName(b.tutor_name))).map(t => (
            <option key={t.id} value={t.id} className="bg-white dark:bg-[#352e26] text-gray-900 dark:text-gray-100">{t.tutor_name}</option>
          ))}
        </select>

        {/* Date range */}
        <label className="flex items-center gap-1 text-xs px-2 py-1 border border-line rounded-full text-gray-500 dark:text-gray-400">
          <span>From</span>
          <input
            type="date"
            value={filters.date_from || ""}
            onChange={(e) => onChange({ ...filters, date_from: e.target.value || undefined })}
            className="bg-transparent focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1 text-xs px-2 py-1 border border-line rounded-full text-gray-500 dark:text-gray-400">
          <span>To</span>
          <input
            type="date"
            value={filters.date_to || ""}
            onChange={(e) => onChange({ ...filters, date_to: e.target.value || undefined })}
            className="bg-transparent focus:outline-none"
          />
        </label>

        {/* Has attachments toggle */}
        <button
          type="button"
          onClick={() => onChange({ ...filters, has_attachments: !filters.has_attachments || undefined })}
          aria-pressed={!!filters.has_attachments}
          className={cn(
            "flex items-center gap-1 text-xs px-2 py-1 border rounded-full transition-colors",
            filters.has_attachments
              ? "border-primary bg-primary/10 text-accent-ink"
              : "border-line text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <Paperclip className="h-3 w-3" />
          <span>Attachments</span>
        </button>

        {/* Priority filter */}
        {PRIORITIES.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onChange({ ...filters, priority: filters.priority === p ? undefined : p })}
            aria-pressed={filters.priority === p}
            className={cn(
              "text-xs px-2 py-1 border rounded-full transition-colors",
              filters.priority === p
                ? "border-primary bg-primary/10 text-accent-ink"
                : "border-line text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            {p}
          </button>
        ))}

        {/* Clear all */}
        {hasAny && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="flex items-center gap-1 text-xs px-2 py-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
