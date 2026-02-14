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

export function TutorAvatar({ name, id, pictureUrl, size = "md", isOnline }: {
  name: string;
  id: number;
  pictureUrl?: string;
  size?: "sm" | "md";
  isOnline?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const sizeClass = size === "sm" ? "w-6 h-6 text-[10px]" : "w-8 h-8 text-xs";
  const dotSize = size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5";

  const validPicture = pictureUrl?.startsWith("http") ? pictureUrl : undefined;

  const avatar = validPicture && !imgError ? (
    <img
      src={validPicture}
      alt={name}
      className={cn(sizeClass, "rounded-full object-cover flex-shrink-0")}
      referrerPolicy="no-referrer"
      onError={() => setImgError(true)}
    />
  ) : (
    <div className={cn(sizeClass, "rounded-full flex items-center justify-center text-white font-bold flex-shrink-0", getAvatarColor(id))}>
      {getInitials(name)}
    </div>
  );

  if (isOnline === undefined) return avatar;

  return (
    <div className="relative inline-flex flex-shrink-0">
      {avatar}
      {isOnline && (
        <span className={cn(dotSize, "absolute bottom-0 right-0 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#1a1a1a]")} />
      )}
    </div>
  );
}
