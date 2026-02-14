"use client";

import React, { useState, useRef, useEffect } from "react";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";
import { stripHtml } from "@/lib/html-utils";
import type { Message } from "@/types";

interface ThreadSearchBarProps {
  allMessages: Message[];
  threadSearch: string;
  onSearchChange: (term: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

export default function ThreadSearchBar({
  allMessages,
  threadSearch,
  onSearchChange,
  scrollRef,
  onClose,
}: ThreadSearchBarProps) {
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Auto-scroll to first match on search change
  useEffect(() => {
    if (!threadSearch || !scrollRef.current) return;
    const timer = setTimeout(() => {
      const lc = threadSearch.toLowerCase();
      const firstIdx = allMessages.findIndex(m =>
        stripHtml(m.message).toLowerCase().includes(lc)
      );
      if (firstIdx !== -1) {
        const el = scrollRef.current?.querySelector(`[data-msg-idx="${firstIdx}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [threadSearch, allMessages, scrollRef]);

  // Compute matches
  const matchedIds = threadSearch
    ? allMessages
        .map((m, i) => stripHtml(m.message).toLowerCase().includes(threadSearch.toLowerCase()) ? i : -1)
        .filter(i => i !== -1)
    : [];
  const matchCount = matchedIds.length;
  const clampedIdx = matchCount > 0 ? Math.min(searchMatchIdx, matchCount - 1) : 0;

  const scrollToMatch = (idx: number) => {
    const msgIdx = matchedIds[idx];
    if (msgIdx == null || !scrollRef.current) return;
    const msgEl = scrollRef.current.querySelector(`[data-msg-idx="${msgIdx}"]`);
    if (msgEl) msgEl.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 bg-[#faf6f1]/50 dark:bg-[#1a1a1a]/50">
      <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={threadSearch}
        onChange={(e) => { onSearchChange(e.target.value); setSearchMatchIdx(0); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { onClose(); }
          if (e.key === "Enter" && matchCount > 0) {
            e.preventDefault();
            const next = e.shiftKey
              ? (clampedIdx - 1 + matchCount) % matchCount
              : (clampedIdx + 1) % matchCount;
            setSearchMatchIdx(next);
            scrollToMatch(next);
          }
        }}
        placeholder="Search messages..."
        className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none"
      />
      {threadSearch && (
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {matchCount > 0 ? `${clampedIdx + 1}/${matchCount}` : "0 found"}
        </span>
      )}
      {matchCount > 1 && (
        <div className="flex items-center">
          <button
            onClick={() => { const prev = (clampedIdx - 1 + matchCount) % matchCount; setSearchMatchIdx(prev); scrollToMatch(prev); }}
            className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            title="Previous match (Shift+Enter)"
          >
            <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
          </button>
          <button
            onClick={() => { const next = (clampedIdx + 1) % matchCount; setSearchMatchIdx(next); scrollToMatch(next); }}
            className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            title="Next match (Enter)"
          >
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </button>
        </div>
      )}
      <button
        onClick={onClose}
        className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
      >
        <X className="h-3.5 w-3.5 text-gray-400" />
      </button>
    </div>
  );
}
