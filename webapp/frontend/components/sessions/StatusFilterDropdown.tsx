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
import { ChevronDown, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSessionStatusConfig } from "@/lib/session-status";

/** Special composite filter value that excludes resolved statuses */
export const ACTIVE_FILTER = "__active";

interface StatusOption {
  value: string;
  label: string;
  separator?: boolean; // Show a separator line after this option
}

const STATUS_OPTIONS: StatusOption[] = [
  { value: "", label: "All Statuses" },
  { value: ACTIVE_FILTER, label: "Active", separator: true },
  { value: "Trial Class", label: "Trial Class" },
  { value: "Scheduled", label: "Scheduled" },
  { value: "Make-up Class", label: "Make-up Class" },
  { value: "Attended", label: "Attended" },
  { value: "Attended (Make-up)", label: "Attended (Make-up)" },
  { value: "No Show", label: "No Show" },
  { value: "Rescheduled - Pending Make-up", label: "Rescheduled - Pending Make-up" },
  { value: "Sick Leave - Pending Make-up", label: "Sick Leave - Pending Make-up" },
  { value: "Weather Cancelled - Pending Make-up", label: "Weather Cancelled - Pending Make-up" },
  { value: "Rescheduled - Make-up Booked", label: "Rescheduled - Make-up Booked" },
  { value: "Sick Leave - Make-up Booked", label: "Sick Leave - Make-up Booked" },
  { value: "Weather Cancelled - Make-up Booked", label: "Weather Cancelled - Make-up Booked" },
  { value: "Cancelled", label: "Cancelled" },
];

interface StatusFilterDropdownProps {
  value: string;
  onChange: (value: string) => void;
}

export function StatusFilterDropdown({ value, onChange }: StatusFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
    ],
    whileElementsMounted: autoUpdate,
    placement: "bottom-start",
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  const selectedOption = STATUS_OPTIONS.find(opt => opt.value === value);
  const isActiveFilter = value === ACTIVE_FILTER;
  const selectedConfig = value && !isActiveFilter ? getSessionStatusConfig(value) : null;
  const SelectedIcon = selectedConfig?.Icon;

  return (
    <>
      {/* Trigger button */}
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 text-sm",
          "bg-white dark:bg-[#1a1a1a]",
          "border border-[#d4a574] dark:border-[#6b5a4a] rounded-md",
          "focus:outline-none focus:ring-1 focus:ring-[#a0704b]",
          "text-gray-900 dark:text-gray-100 font-medium",
          "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
        )}
      >
        {isActiveFilter ? (
          <span className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center bg-emerald-500">
            <Zap className="h-2.5 w-2.5 text-white" />
          </span>
        ) : selectedConfig && SelectedIcon ? (
          <span className={cn("w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center", selectedConfig.bgClass)}>
            <SelectedIcon className={cn("h-2.5 w-2.5 text-white", selectedConfig.iconClass)} />
          </span>
        ) : null}
        <span className="truncate max-w-[100px] sm:max-w-[180px]">{selectedOption?.label || "Status"}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-[#a0704b] transition-transform", isOpen && "rotate-180")} />
      </button>

      {/* Dropdown menu */}
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
              "rounded-md shadow-lg",
              "py-1 min-w-[180px] max-h-[300px] overflow-y-auto"
            )}
          >
            {STATUS_OPTIONS.map((option) => {
              const isActive = option.value === ACTIVE_FILTER;
              const config = option.value && !isActive ? getSessionStatusConfig(option.value) : null;
              const Icon = config?.Icon;
              const isSelected = option.value === value;

              return (
                <div key={option.value || "_all"}>
                  <button
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left",
                      "hover:bg-gray-100 dark:hover:bg-gray-800",
                      isSelected && "bg-gray-100 dark:bg-gray-800"
                    )}
                  >
                    {isActive ? (
                      <span className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center bg-emerald-500">
                        <Zap className="h-2.5 w-2.5 text-white" />
                      </span>
                    ) : config ? (
                      <span className={cn("w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center", config.bgClass)}>
                        {Icon && <Icon className={cn("h-2.5 w-2.5 text-white", config.iconClass)} />}
                      </span>
                    ) : (
                      <span className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-300 dark:bg-gray-600" />
                    )}
                    <span className={cn(
                      "text-gray-900 dark:text-gray-100",
                      isSelected && "font-medium"
                    )}>
                      {option.label}
                    </span>
                  </button>
                  {option.separator && <div className="my-1 border-t border-gray-200 dark:border-gray-700" />}
                </div>
              );
            })}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
