"use client";

import type { InkSyncStatus } from "@/hooks/useAnnotations";
import { cn } from "@/lib/utils";

// Nothing shows while the lesson's ink is still loading.
const LABELS: Record<InkSyncStatus, string | null> = {
  loading: null,
  saved: "Saved",
  saving: "Saving…",
  waiting: "Not saved yet",
  offline: "Offline",
};

/** Where the lesson's ink stands with the server, in a word or two, for the lesson header. */
export function InkSaveStatus({ status, className }: { status: InkSyncStatus; className?: string }) {
  const label = LABELS[status];
  if (!label) return null;
  return (
    <span role="status" className={cn("text-xs text-white/50 whitespace-nowrap select-none", className)}>
      {label}
    </span>
  );
}
