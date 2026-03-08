"use client";

import { useEffect } from "react";
import { X, MessageSquare } from "lucide-react";

interface NewMessageBannerProps {
  senderName: string;
  preview: string;
  threadId: number;
  isUrgent?: boolean;
  onJump: (threadId: number) => void;
  onDismiss: () => void;
}

export default function NewMessageBanner({ senderName, preview, threadId, isUrgent, onJump, onDismiss }: NewMessageBannerProps) {
  // Auto-dismiss after 5s (unless urgent)
  useEffect(() => {
    if (isUrgent) return;
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss, isUrgent]);

  const accent = isUrgent
    ? "border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/20"
    : "border-[#d4a574] dark:border-[#8b6f47] bg-[#faf6f1] dark:bg-[#2a2520]";

  return (
    <div
      className={`flex items-center gap-2 mx-2 mt-2 px-3 py-2 rounded-lg border ${accent} cursor-pointer animate-in slide-in-from-top-2 fade-in duration-300`}
      onClick={() => onJump(threadId)}
    >
      <MessageSquare className={`h-3.5 w-3.5 flex-shrink-0 ${isUrgent ? "text-red-500" : "text-[#a0704b]"}`} />
      <div className="flex-1 min-w-0">
        <span className={`text-xs font-semibold ${isUrgent ? "text-red-600 dark:text-red-400" : "text-[#a0704b]"}`}>
          {senderName}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400 ml-1.5 truncate">
          {preview.length > 60 ? preview.slice(0, 60) + "..." : preview}
        </span>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="p-0.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
