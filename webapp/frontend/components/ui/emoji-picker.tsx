"use client";

import React, { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

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
}

export function EmojiPicker({ onSelect, isOpen, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [selectedGroup, setSelectedGroup] = useState(0);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

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

  if (!isOpen) return null;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-2 bg-white dark:bg-[#2a2a2a] rounded-lg shadow-xl border border-[#e8d4b8] dark:border-[#6b5a4a] p-2 z-50 w-64"
    >
      {/* Group tabs */}
      <div className="flex gap-1 mb-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] pb-2">
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
        {EMOJI_GROUPS[selectedGroup].emojis.map((emoji) => (
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
    </div>
  );
}
