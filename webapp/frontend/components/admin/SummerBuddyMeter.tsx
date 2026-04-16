"use client";

import { User } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "green" | "emerald";

const FILLED: Record<Tone, string> = {
  green: "text-green-600 dark:text-green-400 fill-green-600 dark:fill-green-400",
  emerald: "text-emerald-600 dark:text-emerald-400 fill-emerald-600 dark:fill-emerald-400",
};

const UNLOCKED_BG: Record<Tone, string> = {
  green: "bg-green-100 dark:bg-green-900/30",
  emerald: "bg-emerald-100 dark:bg-emerald-900/30",
};

export function SummerBuddyMeter({
  count,
  slots,
  unlocked,
  tone = "emerald",
  title,
}: {
  count: number;
  slots: number;
  unlocked: boolean;
  tone?: Tone;
  title?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded",
        unlocked ? UNLOCKED_BG[tone] : "bg-amber-100 dark:bg-amber-900/30",
      )}
      title={title}
    >
      {Array.from({ length: slots }).map((_, i) => (
        <User
          key={i}
          className={cn(
            "h-3 w-3",
            i < count
              ? unlocked
                ? FILLED[tone]
                : "text-amber-600 dark:text-amber-400 fill-amber-600 dark:fill-amber-400"
              : "text-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}
