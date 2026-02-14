"use client";

import React, { useState, useEffect, RefObject } from "react";
import { cn } from "@/lib/utils";
import FloatingDropdown from "@/components/inbox/FloatingDropdown";

const FREQ_EMOJI_KEY = "inbox_frequent_emoji";

function getFrequentEmojis(max = 12): string[] {
  try {
    const data = JSON.parse(localStorage.getItem(FREQ_EMOJI_KEY) || "[]") as { emoji: string; count: number }[];
    return data.sort((a, b) => b.count - a.count).slice(0, max).map(d => d.emoji);
  } catch {
    return [];
  }
}

const EMOJI_GROUPS = [
  { label: "Smileys", emojis: ["😀", "😊", "😂", "🤣", "😍", "🤔", "😅", "😎", "🙂", "😉", "😢", "😤"] },
  { label: "Gestures", emojis: ["👍", "👎", "👏", "🙌", "✌️", "🤞", "👋", "🙏", "💪", "👌", "🤝", "✋"] },
  { label: "Objects", emojis: ["📚", "📝", "✏️", "📖", "🎓", "📅", "⏰", "💡", "⭐", "✅", "❌", "⚠️"] },
  { label: "Misc", emojis: ["❤️", "🔥", "💯", "🎉", "✨", "💬", "📌", "🚀", "💼", "🏠", "☀️", "🌙"] },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  isOpen: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
}

export function EmojiPicker({ onSelect, isOpen, onClose, triggerRef }: EmojiPickerProps) {
  const [selectedGroup, setSelectedGroup] = useState(-1); // -1 = frequent
  const frequent = getFrequentEmojis();

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  return (
    <FloatingDropdown
      triggerRef={triggerRef}
      isOpen={isOpen}
      onClose={onClose}
      align="right"
      className="bg-white dark:bg-[#2a2a2a] rounded-lg shadow-xl border border-[#e8d4b8] dark:border-[#6b5a4a] p-2 w-64"
    >
      {/* Group tabs */}
      <div className="flex gap-1 mb-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] pb-2">
        {frequent.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectedGroup(-1)}
            className={cn(
              "px-2 py-1 text-xs rounded transition-colors",
              selectedGroup === -1
                ? "bg-[#f5ede3] dark:bg-[#3d3628] text-[#a0704b] font-medium"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            )}
          >
            ⏱️
          </button>
        )}
        {EMOJI_GROUPS.map((group, idx) => (
          <button
            type="button"
            key={group.label}
            onClick={() => setSelectedGroup(idx)}
            className={cn(
              "px-2 py-1 text-xs rounded transition-colors",
              selectedGroup === idx
                ? "bg-[#f5ede3] dark:bg-[#3d3628] text-[#a0704b] font-medium"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            )}
          >
            {group.emojis[0]}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="grid grid-cols-6 gap-1">
        {(selectedGroup === -1 ? frequent : EMOJI_GROUPS[selectedGroup]?.emojis || []).map((emoji) => (
          <button
            type="button"
            key={emoji}
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            className="p-1.5 text-xl hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] rounded transition-colors"
          >
            {emoji}
          </button>
        ))}
      </div>
    </FloatingDropdown>
  );
}
