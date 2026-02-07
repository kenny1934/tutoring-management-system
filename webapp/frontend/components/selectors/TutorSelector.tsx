"use client";

import { useState, useMemo, useEffect } from "react";
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
import { ChevronDown, User, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveTutors } from "@/lib/hooks";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";
import type { Tutor } from "@/types";

// Special value for "All Tutors" mode
export const ALL_TUTORS = 'all' as const;
export type TutorValue = number | typeof ALL_TUTORS | null;

interface TutorSelectorProps {
  value: TutorValue;
  onChange: (tutorId: TutorValue) => void;
  location?: string; // Filter tutors by default_location
  className?: string;
  placeholder?: string;
  allowClear?: boolean; // Show clear option in dropdown
  showAllTutors?: boolean; // Show "All Tutors" option
}

export function TutorSelector({
  value,
  onChange,
  location,
  className,
  placeholder = "Select tutor...",
  allowClear = false,
  showAllTutors = false,
}: TutorSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: allTutors = [] } = useActiveTutors();

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

  // Filter tutors by location and sort by first name
  const filteredTutors = useMemo(() => {
    let tutors = allTutors;

    // Filter by location if specified and not "All Locations"
    if (location && location !== "All Locations") {
      tutors = tutors.filter(t => t.default_location === location);
    }

    // Sort by first name (stripping Mr/Ms/Mrs prefix)
    return [...tutors].sort((a, b) =>
      getTutorSortName(a.tutor_name).localeCompare(getTutorSortName(b.tutor_name))
    );
  }, [allTutors, location]);

  // Auto-select first tutor if none selected and tutors are loaded (unless allowClear or showAllTutors)
  useEffect(() => {
    if (!allowClear && !showAllTutors && value === null && filteredTutors.length > 0) {
      onChange(filteredTutors[0].id);
    }
  }, [value, filteredTutors, onChange, allowClear, showAllTutors]);

  // If current selection is no longer in filtered list, reset to first (or null if allowClear)
  // Skip this check for 'all' value since it's always valid
  useEffect(() => {
    if (value !== null && value !== ALL_TUTORS && filteredTutors.length > 0) {
      const stillValid = filteredTutors.some(t => t.id === value);
      if (!stillValid) {
        onChange(allowClear || showAllTutors ? null : filteredTutors[0].id);
      }
    }
  }, [value, filteredTutors, onChange, allowClear, showAllTutors]);

  const isAllTutorsSelected = value === ALL_TUTORS;
  const selectedTutor = typeof value === 'number' ? filteredTutors.find(t => t.id === value) : null;

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
          "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800",
          className
        )}
      >
        {isAllTutorsSelected ? (
          <Users className="h-3.5 w-3.5 text-[#a0704b] dark:text-[#cd853f] flex-shrink-0" />
        ) : (
          <User className="h-3.5 w-3.5 text-[#a0704b] dark:text-[#cd853f] flex-shrink-0" />
        )}
        <span className="truncate max-w-[150px]">
          {isAllTutorsSelected ? "All Tutors" : (selectedTutor?.tutor_name || placeholder)}
        </span>
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
            {/* Clear option when allowClear is true and a tutor is selected */}
            {allowClear && value !== null && (
              <>
                <button
                  onClick={() => {
                    onChange(null);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left",
                    "hover:bg-gray-100 dark:hover:bg-gray-800",
                    "text-gray-500 dark:text-gray-400"
                  )}
                >
                  <X className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>Clear selection</span>
                </button>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
              </>
            )}

            {/* All Tutors option */}
            {showAllTutors && (
              <>
                <button
                  onClick={() => {
                    onChange(ALL_TUTORS);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left",
                    "hover:bg-gray-100 dark:hover:bg-gray-800",
                    isAllTutorsSelected && "bg-gray-100 dark:bg-gray-800"
                  )}
                >
                  <Users className={cn(
                    "h-3.5 w-3.5 flex-shrink-0",
                    isAllTutorsSelected ? "text-[#a0704b] dark:text-[#cd853f]" : "text-gray-400 dark:text-gray-500"
                  )} />
                  <span className={cn(
                    "text-gray-900 dark:text-gray-100",
                    isAllTutorsSelected && "font-medium"
                  )}>
                    All Tutors
                  </span>
                </button>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
              </>
            )}

            {filteredTutors.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                No tutors available
              </div>
            ) : (
              filteredTutors.map((tutor) => {
                const isSelected = tutor.id === value;

                return (
                  <button
                    key={tutor.id}
                    onClick={() => {
                      onChange(tutor.id);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left",
                      "hover:bg-gray-100 dark:hover:bg-gray-800",
                      isSelected && "bg-gray-100 dark:bg-gray-800"
                    )}
                  >
                    <User className={cn(
                      "h-3.5 w-3.5 flex-shrink-0",
                      isSelected ? "text-[#a0704b] dark:text-[#cd853f]" : "text-gray-400 dark:text-gray-500"
                    )} />
                    <span className={cn(
                      "text-gray-900 dark:text-gray-100",
                      isSelected && "font-medium"
                    )}>
                      {tutor.tutor_name}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
