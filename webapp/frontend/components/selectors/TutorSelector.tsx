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
  normaliseLocation,
  shouldReleaseTutorFilter,
  tutorsForLocation,
  worksAt,
  type DateWindow,
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
  location?: string; // Narrow to the tutors who work at this branch
  /**
   * The days the screen around this control is showing, when it shows any.
   * Coverage of another branch can be limited to certain days, so a control
   * sitting above one day's work should not offer somebody who is only there
   * on Saturdays. Leave it out on a screen with no dates in it, where the
   * answer is meant to be permissive.
   *
   * Pass a stable value. A window written inline is a new object on every
   * render, which would re-narrow the roster every time for no reason.
   */
  when?: string | DateWindow | null;
  className?: string;
  placeholder?: string;
  allowClear?: boolean; // Show clear option in dropdown
  showAllTutors?: boolean; // Show "All Tutors" option
}

export function TutorSelector({
  value,
  onChange,
  location,
  when,
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

  // Everyone who works at the branch on screen, including people who have left
  // and anybody covering from elsewhere. The selection is judged against this
  // rather than against what the dropdown offers, so that a departure never
  // moves the filter off the tutor it is set to. See shouldReleaseTutorFilter
  // for why the two are not the same question.
  //
  // Coverage counts here as well as in the dropdown, and it has to. Switching
  // to MSB while the filter is set to a tutor covering MSB should keep them
  // selected, because their work really is on the screen you just moved to.
  //
  // Deliberately without the days on screen, unlike the dropdown below. Which
  // days somebody covers decides what gets offered; whether they cover the
  // branch at all decides whether a filter set to them is still meaningful.
  // Narrowing here would throw your filter away every time you paged onto a
  // day they happen not to work, which is not what changing the day means.
  const tutorsAtBranch = useMemo(
    () => roster.filter(t => worksAt(t, location)),
    [roster, location]
  );

  // Who the dropdown offers, split into the branch's own people and anybody
  // covering from elsewhere. Narrowed to the days on screen when the caller
  // knows them, and left permissive when it does not, which is the difference
  // between a screen showing one day's work and a screen showing a backlog
  // with no dates in it.
  const { home, visiting } = useMemo(
    () => tutorsForLocation(roster, location, when),
    [roster, location, when]
  );

  const homeTutors = useMemo(() => [...home].sort(byTutorName), [home]);
  const visitingTutors = useMemo(() => [...visiting].sort(byTutorName), [visiting]);

  // Flat, home branch first. Used for the auto-select below, which should land
  // on one of the branch's own tutors rather than on a visitor.
  const offerableTutors = useMemo(
    () => [...homeTutors, ...visitingTutors],
    [homeTutors, visitingTutors]
  );

  // Whoever is currently selected but in neither group, so a control filtering
  // by a departed tutor can still name them instead of sitting there blank.
  // Same purpose as withCurrentTutor, done here rather than through it because
  // the list is rendered in groups and this one needs its own place at the end.
  const orphanTutor = useMemo(() => {
    if (currentId == null || offerableTutors.some(t => t.id === currentId)) return null;
    return roster.find(t => t.id === currentId) ?? null;
  }, [offerableTutors, currentId, roster]);

  const hasAnyOption = offerableTutors.length > 0 || orphanTutor !== null;

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
  const selectedTutor = currentId != null
    ? (offerableTutors.find(t => t.id === currentId) ?? orphanTutor)
    : null;

  // One row, used by all three groups in the list below.
  const renderTutor = (tutor: Tutor) => {
    const isSelected = tutor.id === value;
    // Only ever set on the current selection, since a leaver is in this list
    // at all only because the filter is pointed at them.
    const departure = departureLabel(tutor);
    // Where a visiting tutor normally is, so the name is never ambiguous.
    // Compares home branches only, since a tutor who is here on coverage is
    // exactly the one whose own branch is worth naming.
    const narrowed = Boolean(location) && location !== "All Locations";
    const homeBranch =
      narrowed && normaliseLocation(tutor.default_location) !== normaliseLocation(location)
        ? normaliseLocation(tutor.default_location)
        : null;

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
        {departure ? (
          <span className="ml-auto text-[10px] text-rose-600 dark:text-rose-400 flex-shrink-0">
            {departure}
          </span>
        ) : homeBranch ? (
          <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
            {homeBranch}
          </span>
        ) : null}
      </button>
    );
  };

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

            {!hasAnyOption ? (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                No tutors available
              </div>
            ) : (
              <>
                {homeTutors.map(renderTutor)}

                {/* The branch's own people first, then anybody covering, under
                    a heading that says where they normally are. Mixing the two
                    is how somebody ends up picking a tutor who is usually at
                    the other branch without noticing. */}
                {visitingTutors.length > 0 && (
                  <>
                    <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
                      <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        Covering from another branch
                      </div>
                    </div>
                    {visitingTutors.map(renderTutor)}
                  </>
                )}

                {orphanTutor && (
                  <>
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                    {renderTutor(orphanTutor)}
                  </>
                )}
              </>
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
