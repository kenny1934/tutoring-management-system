"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/** The segmented icon toggle that switches an applications page between its
 *  views (list / board / stats). One control for both intakes' pages, so the
 *  look stays in step. */
export function ViewModeToggle<T extends string>({ value, onChange, modes }: {
  value: T;
  onChange: (mode: T) => void;
  modes: { key: T; icon: LucideIcon; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {modes.map(({ key, icon: Icon, label }, i) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          title={label}
          aria-label={label}
          aria-pressed={value === key}
          className={cn(
            "px-2 py-1.5 transition-colors",
            i > 0 && "border-l border-gray-200 dark:border-gray-700",
            value === key
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
