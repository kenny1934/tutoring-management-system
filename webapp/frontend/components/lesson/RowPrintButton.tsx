"use client";

import { Loader2, Printer } from "lucide-react";
import { cn } from "@/lib/utils";

interface RowPrintButtonProps {
  onPrint: () => void;
  isPrinting: boolean;
  /** The tooltip, which shows the progress while printing. */
  title: string;
  /** What a screen reader announces, such as "Print Algebra 3". */
  label: string;
  /** Colours the printer, as the classwork and homework buttons do. */
  iconClassName?: string;
}

/**
 * The print button beside a row in a lesson sidebar. It's always visible and
 * 40px square, with its own border and a gap from the row, so a finger aiming
 * at the row can't print by accident. The old icons only appeared on hover,
 * which a touch board never has, yet they still took taps.
 */
export function RowPrintButton({ onPrint, isPrinting, title, label, iconClassName }: RowPrintButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (!isPrinting) onPrint(); }}
      disabled={isPrinting}
      title={title}
      aria-label={label}
      aria-busy={isPrinting || undefined}
      className={cn(
        "flex-none w-10 h-10 grid place-items-center rounded-md transition-colors",
        "border border-[#e8d4b8] dark:border-[#3a3228] bg-white/50 dark:bg-black/10",
        "hover:bg-[#e8d4b8]/60 dark:hover:bg-[#3a3228] disabled:cursor-wait",
      )}
    >
      {isPrinting
        ? <Loader2 className={cn("h-4 w-4 animate-spin text-[#a0906e] dark:text-[#8a7a60]", iconClassName)} />
        : <Printer className={cn("h-4 w-4 text-[#a0906e] dark:text-[#8a7a60]", iconClassName)} />}
    </button>
  );
}
