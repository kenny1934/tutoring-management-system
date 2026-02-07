"use client";

import { useState } from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useDismiss,
  useInteractions,
  FloatingPortal,
  useClick,
} from "@floating-ui/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TERMINATION_REASON_CATEGORIES,
  CATEGORY_CONFIG,
} from "@/lib/termination-constants";

interface CategoryDropdownProps {
  value: string;
  onChange: (value: string) => void;
  /** Placeholder when no value selected */
  placeholder?: string;
  /** Compact mode for table cells */
  compact?: boolean;
  disabled?: boolean;
  /** Show "all" option (for filters) vs blank option (for selectors) */
  showAllOption?: boolean;
}

export function CategoryDropdown({
  value,
  onChange,
  placeholder = "-- Select --",
  compact = false,
  disabled = false,
  showAllOption = false,
}: CategoryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: disabled ? undefined : setIsOpen,
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
    ],
    whileElementsMounted: autoUpdate,
    placement: "bottom-start",
  });

  const click = useClick(context, { enabled: !disabled });
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  const config = value ? CATEGORY_CONFIG[value] : null;
  const Icon = config?.Icon;

  return (
    <>
      {/* Trigger */}
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        disabled={disabled}
        className={cn(
          "flex items-center gap-1.5 text-left",
          "border rounded-md transition-colors",
          "focus:outline-none focus:ring-1 focus:ring-[#a0704b] dark:focus:ring-[#cd853f]",
          "cursor-pointer",
          compact
            ? "px-2 py-1 text-sm min-w-0"
            : "px-3 py-1.5 text-sm",
          disabled
            ? "opacity-60 cursor-not-allowed bg-transparent border-transparent"
            : value
              ? "bg-white dark:bg-[#1a1a1a] border-[#d4a574] dark:border-[#6b5a4a] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
              : "bg-white dark:bg-[#1a1a1a] border-transparent hover:border-[#d4a574] dark:hover:border-[#6b5a4a]"
        )}
      >
        {config && (
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: config.color }}
          />
        )}
        {config && Icon && !compact && (
          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: config.color }} />
        )}
        <span className={cn(
          "truncate",
          compact ? "max-w-[100px]" : "max-w-[160px]",
          value
            ? "text-gray-900 dark:text-gray-100"
            : "text-muted-foreground"
        )}>
          {value || placeholder}
        </span>
        <ChevronDown className={cn(
          "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
          isOpen && "rotate-180"
        )} />
      </button>

      {/* Menu */}
      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className={cn(
              "z-[9999]",
              "bg-white dark:bg-[#1a1a1a]",
              "border border-[#d4a574] dark:border-[#6b5a4a]",
              "rounded-lg shadow-lg",
              "py-1 min-w-[200px] max-h-[320px] overflow-y-auto"
            )}
          >
            {/* Empty / All option */}
            <button
              onClick={() => { onChange(""); setIsOpen(false); }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left",
                "hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]",
                !value && "bg-[#f5ede3]/50 dark:bg-[#3d3628]/50"
              )}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-gray-300 dark:bg-gray-600" />
              <span className={cn(
                "text-gray-600 dark:text-gray-400",
                !value && "font-medium"
              )}>
                {showAllOption ? "All Categories" : "-- None --"}
              </span>
            </button>

            {/* Category options */}
            {TERMINATION_REASON_CATEGORIES.map((cat) => {
              const catConfig = CATEGORY_CONFIG[cat];
              const CatIcon = catConfig?.Icon;
              const isSelected = cat === value;

              return (
                <button
                  key={cat}
                  onClick={() => { onChange(cat); setIsOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left",
                    "hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]",
                    isSelected && "bg-[#f5ede3]/50 dark:bg-[#3d3628]/50"
                  )}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: catConfig?.color }}
                  />
                  {CatIcon && (
                    <CatIcon
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: catConfig?.color }}
                    />
                  )}
                  <span className={cn(
                    "text-gray-900 dark:text-gray-100",
                    isSelected && "font-medium"
                  )}>
                    {cat}
                  </span>
                </button>
              );
            })}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
