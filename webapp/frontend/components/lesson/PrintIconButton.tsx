"use client";

import { Loader2, Printer } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrintIconButtonProps {
  onPrint: () => void;
  isPrinting: boolean;
  /** The tooltip, which shows the progress while printing. */
  title: string;
  /** What a screen reader announces, such as "Print Algebra 3". */
  label: string;
  /** Colours the printer, as the classwork and homework buttons do. */
  iconClassName?: string;
  /**
   * Show the button only while a mouse is over its row, which marks itself
   * with the `group/row` class. Worksheet rows use this, and headings don't.
   */
  revealOnHover?: boolean;
}

/**
 * A quiet printer icon in a lesson sidebar. In a heading it prints everything
 * under the heading, and it's always there. On a worksheet row it only
 * appears while a mouse is over the row, because the usual way to print one
 * worksheet is to open it and use Print in the viewer's toolbar, and a
 * printer on every row made the list hard to read.
 *
 * On a screen with touch, a row's printer doesn't appear at all, even with a
 * mouse plugged in too. A tap can count as a hover there, so a hidden button
 * could still catch the tap, which is how the old hover icons used to print
 * when a tutor only meant to open a worksheet.
 */
export function PrintIconButton({ onPrint, isPrinting, title, label, iconClassName, revealOnHover }: PrintIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onPrint}
      disabled={isPrinting}
      title={title}
      aria-label={label}
      aria-busy={isPrinting || undefined}
      className={cn(
        "flex-none w-8 h-8 grid place-items-center rounded-md transition-[opacity,background-color]",
        "hover:bg-[#e8d4b8]/60 dark:hover:bg-[#3a3228] disabled:cursor-wait",
        revealOnHover && "[@media(any-pointer:coarse)]:hidden",
        // While it's printing it stays in view, so the spinner shows the progress.
        revealOnHover && !isPrinting && [
          "opacity-0 pointer-events-none focus-visible:opacity-100 focus-visible:pointer-events-auto",
          "group-hover/row:opacity-100 group-hover/row:pointer-events-auto",
        ],
      )}
    >
      {isPrinting
        ? <Loader2 className={cn("h-4 w-4 animate-spin text-[#a0906e] dark:text-[#8a7a60]", iconClassName)} />
        : <Printer className={cn("h-4 w-4 text-[#a0906e] dark:text-[#8a7a60]", iconClassName)} />}
    </button>
  );
}
