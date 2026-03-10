import React from "react";
import type { TypingUser } from "@/lib/useSSE";

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
}

export default function TypingIndicator({ typingUsers }: TypingIndicatorProps) {
  if (typingUsers.length === 0) return null;

  const names = typingUsers.map(u => {
    const parts = u.tutorName.split(" ").filter(Boolean);
    if (parts.length > 1 && /^(mr|ms)\.?$/i.test(parts[0])) {
      return parts[1];
    }
    return parts[0] || u.tutorName;
  });
  let text: string;
  if (names.length === 1) {
    text = `${names[0]} is typing`;
  } else if (names.length === 2) {
    text = `${names[0]} and ${names[1]} are typing`;
  } else {
    text = `${names[0]} and ${names.length - 1} others are typing`;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-gray-500 dark:text-gray-400" aria-live="polite" role="status">
      <span className="inline-flex gap-0.5" aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-[#a0704b] animate-[typing-dot_1.4s_ease-in-out_infinite]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#a0704b] animate-[typing-dot_1.4s_ease-in-out_0.2s_infinite]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#a0704b] animate-[typing-dot_1.4s_ease-in-out_0.4s_infinite]" />
      </span>
      <span>{text}</span>
    </div>
  );
}
