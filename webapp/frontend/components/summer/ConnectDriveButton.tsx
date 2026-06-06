"use client";

import { Cable } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Prompt to pick the courseware Finalised folder on this machine, shown
 * wherever summer files open via the per-year drive handle (lesson panels,
 * admin health view, Browse tab matrix).
 */
export function ConnectDriveButton({
  onClick,
  title,
  label = "Connect drive",
  size = "xs",
}: {
  onClick: () => void;
  title: string;
  label?: string;
  /** "xs" fits the tight lesson sidebars; "sm" the full-width pages. */
  size?: "xs" | "sm";
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors",
        size === "xs" ? "gap-1 px-1.5 py-0.5 rounded text-[10px]" : "gap-1.5 px-2 py-1 rounded-lg text-xs font-medium"
      )}
    >
      <Cable className={size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {label}
    </button>
  );
}
