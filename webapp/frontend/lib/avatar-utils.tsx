"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500",
  "bg-purple-500", "bg-cyan-500", "bg-orange-500", "bg-teal-500",
];

export function getInitials(name: string): string {
  // Strip Mr/Ms/Mrs prefix before computing initials
  const cleaned = name.replace(/^(Mr\.?|Ms\.?|Mrs\.?)\s*/i, '').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (cleaned[0] || "?").toUpperCase();
}

export function getAvatarColor(id: number): string {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

export function TutorAvatar({ name, id, pictureUrl, size = "md" }: {
  name: string;
  id: number;
  pictureUrl?: string;
  size?: "sm" | "md";
}) {
  const [imgError, setImgError] = useState(false);
  const sizeClass = size === "sm" ? "w-6 h-6 text-[10px]" : "w-8 h-8 text-xs";
  if (pictureUrl && !imgError) {
    return (
      <img
        src={pictureUrl}
        alt={name}
        className={cn(sizeClass, "rounded-full object-cover flex-shrink-0")}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className={cn(sizeClass, "rounded-full flex items-center justify-center text-white font-bold flex-shrink-0", getAvatarColor(id))}>
      {getInitials(name)}
    </div>
  );
}
