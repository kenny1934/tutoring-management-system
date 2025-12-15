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
import { ChevronDown, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTutors } from "@/lib/hooks";
import type { Tutor } from "@/types";

// Helper to sort tutors by first name (stripping Mr/Ms/Mrs prefix)
const getTutorSortName = (name: string) => name.replace(/^(Mr\.?|Ms\.?|Mrs\.?)\s*/i, '');

interface TutorSelectorProps {
  value: number | null;
  onChange: (tutorId: number | null) => void;
  location?: string; // Filter tutors by default_location
  className?: string;
  placeholder?: string;
}

export function TutorSelector({
  value,
  onChange,
  location,
  className,
  placeholder = "Select tutor...",
}: TutorSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: allTutors = [] } = useTutors();

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

  // Auto-select first tutor if none selected and tutors are loaded
  useEffect(() => {
    if (value === null && filteredTutors.length > 0) {
      onChange(filteredTutors[0].id);
    }
  }, [value, filteredTutors, onChange]);

  // If current selection is no longer in filtered list, reset to first
  useEffect(() => {
    if (value !== null && filteredTutors.length > 0) {
      const stillValid = filteredTutors.some(t => t.id === value);
      if (!stillValid) {
        onChange(filteredTutors[0].id);
      }
    }
  }, [value, filteredTutors, onChange]);

  const selectedTutor = filteredTutors.find(t => t.id === value);

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
        <User className="h-3.5 w-3.5 text-[#a0704b] dark:text-[#cd853f] flex-shrink-0" />
        <span className="truncate max-w-[150px]">
          {selectedTutor?.tutor_name || placeholder}
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
