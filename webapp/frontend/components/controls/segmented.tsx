/**
 * A choice between two to four options, shown side by side, such as "Book
 * directly" or "Propose to tutor", or List, Week and Month. The chosen one is
 * raised onto a white face with an oak edge. Each option can carry an icon,
 * coloured when the options are statuses.
 */
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: LucideIcon;
  iconClassName?: string;
  /** Shown on hover, for an option whose label is short. */
  title?: string;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** What the choice is about, read out by screen readers. */
  label: string;
  className?: string;
}

export function Segmented<T extends string>({ options, value, onChange, label, className }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex gap-0.5 rounded-md border border-line bg-tint p-0.5", className)}>
      {options.map((option) => {
        const Icon = option.icon;
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            title={option.title}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded px-2.5 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              "disabled:pointer-events-none disabled:opacity-50",
              on
                ? "bg-field-fill text-gray-900 ring-1 ring-line-strong dark:text-gray-100"
                : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100",
            )}
          >
            {Icon && <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", option.iconClassName)} aria-hidden="true" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
