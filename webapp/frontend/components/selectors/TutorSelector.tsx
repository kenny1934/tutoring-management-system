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
import { useTutors } from "@/lib/hooks";
import {
  departureLabel,
  pickableTutors,
  shouldReleaseTutorFilter,
  withCurrentTutor,
} from "@/lib/employment";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";
import type { Tutor } from "@/types";

// Special value for "All Tutors" mode
export const ALL_TUTORS = 'all' as const;
export type TutorValue = number | typeof ALL_TUTORS | null;

/** Stable empty list so a fetch in flight does not recompute the narrowing. */
const NO_TUTORS: Tutor[] = [];

const byTutorName = (a: Tutor, b: Tutor) =>
  getTutorSortName(a.tutor_name).localeCompare(getTutorSortName(b.tutor_name));

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
  const { data: roster = NO_TUTORS } = useTutors();
  const currentId = typeof value === 'number' ? value : null;

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

  // Everyone at the branch on screen, including people who have left. The
  // selection is judged against this rather than against what the dropdown
  // offers, so that a departure never moves the filter off the tutor it is set
  // to. See shouldReleaseTutorFilter for why the two are not the same question.
  const tutorsAtBranch = useMemo(() => {
    if (!location || location === "All Locations") return roster;
    return roster.filter(t => t.default_location === location);
  }, [roster, location]);

  // Who the dropdown offers: the people who can still be given work, in the
  // order every picker on the site shows them.
  const offerableTutors = useMemo(
    () => pickableTutors(tutorsAtBranch).sort(byTutorName),
    [tutorsAtBranch]
  );

  // What it renders: the same list with whoever is currently selected put back,
  // so a control that is filtering by a departed tutor can still name them
  // instead of sitting there blank.
  const filteredTutors = useMemo(
    () => [...withCurrentTutor(offerableTutors, currentId, roster)].sort(byTutorName),
    [offerableTutors, currentId, roster]
  );

  // Auto-select first tutor if none selected and tutors are loaded (unless allowClear or showAllTutors)
  useEffect(() => {
    if (!allowClear && !showAllTutors && value === null && offerableTutors.length > 0) {
      onChange(offerableTutors[0].id);
    }
  }, [value, offerableTutors, onChange, allowClear, showAllTutors]);

  // Let go of a tutor who belongs to another branch, and only for that reason.
  // 'all' is always valid, so it is never released.
  useEffect(() => {
    if (value === ALL_TUTORS) return;
    if (!shouldReleaseTutorFilter(tutorsAtBranch, currentId)) return;
    onChange(allowClear || showAllTutors ? null : (offerableTutors[0]?.id ?? null));
  }, [value, currentId, tutorsAtBranch, offerableTutors, onChange, allowClear, showAllTutors]);

  const isAllTutorsSelected = value === ALL_TUTORS;
  const selectedTutor = currentId != null ? filteredTutors.find(t => t.id === currentId) : null;

  return (
    <>
      {/* Trigger button */}
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-sm",
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
                // Only ever set on the current selection, since a leaver is in
                // this list at all only because the filter is pointed at them.
                const departure = departureLabel(tutor);

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
                    {departure && (
                      <span className="ml-auto text-[10px] text-rose-600 dark:text-rose-400 flex-shrink-0">
                        {departure}
                      </span>
                    )}
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
