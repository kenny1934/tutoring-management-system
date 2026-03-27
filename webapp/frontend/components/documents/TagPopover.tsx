"use client";

import { useState, useRef } from "react";
import { Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTagColor } from "@/lib/tag-colors";
import type { Document } from "@/types";

export interface TagPopoverProps {
  doc: Document;
  allTags: string[];
  onToggleTag: (docId: number, tag: string, checked: boolean) => void;
  onCreateTag: (docId: number, tag: string) => void;
  onClose: () => void;
}

export default function TagPopover({ doc, allTags, onToggleTag, onCreateTag, onClose }: TagPopoverProps) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const tags = doc.tags ?? [];

  const filtered = allTags.filter((t) => t.toLowerCase().includes(search.toLowerCase()));
  const showCreate = search.trim() && !allTags.some((t) => t.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-xl"
        style={{ width: "18rem", maxWidth: "calc(100vw - 2rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 pt-3 pb-2">
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-2">{doc.title}</p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              ref={inputRef}
              autoFocus
              type="text"
              placeholder="Search or create tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && showCreate) {
                  e.preventDefault();
                  onCreateTag(doc.id, search.trim());
                  setSearch("");
                }
                if (e.key === "Escape") onClose();
              }}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-white dark:bg-[#1a1a1a] text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#a0704b]/40"
            />
          </div>
        </div>

        <div className="max-h-48 overflow-y-auto px-1 pb-1">
          {filtered.map((tag) => {
            const checked = tags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => onToggleTag(doc.id, tag, !checked)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors"
              >
                <div className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                  checked
                    ? "bg-[#a0704b] border-[#a0704b] text-white"
                    : "border-gray-300 dark:border-gray-600"
                )}>
                  {checked && (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className={cn("px-1.5 py-0.5 rounded-full text-xs font-medium", getTagColor(tag))}>
                  {tag}
                </span>
              </button>
            );
          })}
          {showCreate && (
            <button
              onClick={() => {
                onCreateTag(doc.id, search.trim());
                setSearch("");
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-[#a0704b] dark:text-[#cd853f] hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create &ldquo;{search.trim()}&rdquo;
            </button>
          )}
          {filtered.length === 0 && !showCreate && (
            <p className="px-2 py-3 text-xs text-gray-400 text-center">No tags found</p>
          )}
        </div>
      </div>
    </div>
  );
}
