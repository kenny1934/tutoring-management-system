"use client";

import React, { useRef, useEffect } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CollapsibleSectionProps {
  id: string;
  label: string;
  count: number;
  colorTheme: 'red' | 'orange' | 'purple' | 'gray';
  isCollapsed: boolean;
  onToggle: () => void;
  // Batch selection props
  showCheckbox?: boolean;
  isAllChecked?: boolean;
  isSomeChecked?: boolean;
  onCheckboxClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}

const colorClasses = {
  red: {
    hover: 'hover:bg-red-50 dark:hover:bg-red-900/30',
    checkbox: 'text-red-500 focus:ring-red-500',
    chevron: 'text-red-500',
    text: 'text-red-600 dark:text-red-400',
  },
  orange: {
    hover: 'hover:bg-orange-50 dark:hover:bg-orange-900/10',
    checkbox: 'text-orange-500 focus:ring-orange-500',
    chevron: 'text-orange-500',
    text: 'text-orange-600 dark:text-orange-400',
  },
  purple: {
    hover: 'hover:bg-purple-50 dark:hover:bg-purple-900/10',
    checkbox: 'text-purple-500 focus:ring-purple-500',
    chevron: 'text-purple-400',
    text: 'text-purple-500 dark:text-purple-400',
  },
  gray: {
    hover: 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
    checkbox: 'text-gray-500 focus:ring-gray-500',
    chevron: 'text-gray-400',
    text: 'text-gray-500 dark:text-gray-400',
  },
};

export const CollapsibleSection = React.memo(function CollapsibleSection({
  id,
  label,
  count,
  colorTheme,
  isCollapsed,
  onToggle,
  showCheckbox = false,
  isAllChecked = false,
  isSomeChecked = false,
  onCheckboxClick,
  children,
}: CollapsibleSectionProps) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const colors = colorClasses[colorTheme];

  // Handle indeterminate state
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isSomeChecked && !isAllChecked;
    }
  }, [isSomeChecked, isAllChecked]);

  return (
    <div>
      <button
        onClick={onToggle}
        className={cn(
          "flex items-center gap-2 w-full py-2 px-1 text-left rounded-lg transition-colors",
          colors.hover
        )}
      >
        {showCheckbox && (
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={isAllChecked}
            onChange={() => {}}
            onClick={onCheckboxClick}
            className={cn(
              "h-4 w-4 rounded border-gray-300 cursor-pointer",
              colors.checkbox
            )}
          />
        )}
        {isCollapsed ? (
          <ChevronRight className={cn("h-4 w-4", colors.chevron)} />
        ) : (
          <ChevronDown className={cn("h-4 w-4", colors.chevron)} />
        )}
        <span className={cn("font-semibold", colors.text)}>
          {label} ({count})
        </span>
      </button>
      {!isCollapsed && (
        <div className="space-y-2 mt-2">
          {children}
        </div>
      )}
    </div>
  );
});
