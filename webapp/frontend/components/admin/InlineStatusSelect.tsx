"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePortalPopover } from "@/hooks/usePortalPopover";

export interface StatusPalette {
  dot: string;
  bg: string;
  text: string;
  borderL: string;
}

interface InlineStatusSelectProps {
  value: string;
  onChange: (next: string) => void;
  /** Every status the row can be moved to, in ladder order. */
  statuses: readonly string[];
  colors: Record<string, StatusPalette>;
  icons: Record<string, LucideIcon>;
  /** The closed-state badge — each intake styles its own. */
  badge: React.ReactNode;
}

/**
 * Status badge that doubles as a picker, so a rung can be changed from the
 * list without opening the application. Shared by the summer and regular
 * application cards, which pass their own status tables.
 */
export function InlineStatusSelect({
  value,
  onChange,
  statuses,
  colors,
  icons,
  badge,
}: InlineStatusSelectProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { triggerRef, menuRef, pos } = usePortalPopover(open, close, { align: "right" });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title="Click to change status"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-0.5 hover:opacity-80 transition-opacity cursor-pointer"
      >
        {badge}
        <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Application status"
          className="fixed z-50 min-w-[180px] bg-card border border-border rounded-lg shadow-lg p-1"
          style={{ top: pos.top, right: pos.right }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
          }}
        >
          {statuses.map((opt) => {
            const palette = colors[opt];
            const Icon = icons[opt];
            const isSelected = opt === value;
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  if (opt !== value) onChange(opt);
                }}
                className={cn(
                  "flex items-center gap-1.5 w-full text-left text-xs px-2 py-1 rounded transition-all",
                  palette?.bg, palette?.text,
                  isSelected ? "ring-1 ring-current font-semibold" : "hover:ring-1 hover:ring-current/60",
                  "mb-0.5 last:mb-0"
                )}
              >
                {Icon && <Icon className="h-3 w-3" />}
                {opt}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
