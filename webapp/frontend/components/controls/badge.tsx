/**
 * Badges in the five tones of `lib/tones.ts`.
 *
 * `Badge` is a soft chip with a word in it ("Pending payment"), or a solid one
 * for the rare word that has to stand out. `CountBadge` is the small round
 * number on a button or a link, solid so it can be seen at that size. Pick the
 * tone for what the thing means, not for how it should look: red only ever
 * means something has gone wrong.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { TONES, type Tone } from "@/lib/tones";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  kind?: "soft" | "solid";
}

export function Badge({ tone = "neutral", kind = "soft", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold leading-tight",
        TONES[tone][kind],
        className,
      )}
      {...props}
    />
  );
}

export interface CountBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  count: number;
  tone?: Tone;
  /** Counts above this show as "99+". */
  max?: number;
}

export function CountBadge({ count, tone = "warning", max = 99, className, ...props }: CountBadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums",
        TONES[tone].solid,
        className,
      )}
      {...props}
    >
      {count > max ? `${max}+` : count}
    </span>
  );
}
