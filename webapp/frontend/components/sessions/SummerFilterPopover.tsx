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
import { ChevronDown, Sun, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EMPTY_SUMMER_FILTER,
  SUMMER_FILTER_TOOLTIP,
  countSummerFilterValues,
  isSummerFilterActive,
  summerFilterSummary,
  toggleFacetValue,
  type SummerFilterOptions,
  type SummerFilterState,
} from "@/lib/summer-session-filter";

interface FacetProps<T extends string | number> {
  label: string;
  /** Every value on offer, in display order. */
  values: T[];
  selected: T[];
  /** Renders nothing when this facet has no values to offer. */
  numeric?: boolean;
  /** Prefixed onto each pill's tooltip, e.g. "Type" gives "Type A". */
  titlePrefix?: string;
  onToggle: (next: T[]) => void;
}

/**
 * One labelled row of toggle pills. The label column is a fixed width so the
 * rows line up, and the row disappears entirely when it has nothing to offer.
 */
function Facet<T extends string | number>({
  label,
  values,
  selected,
  numeric,
  titlePrefix,
  onToggle,
}: FacetProps<T>) {
  if (values.length === 0) return null;

  return (
    <div className="flex items-start gap-2 px-3 py-1.5">
      <span className="w-12 shrink-0 pt-1 text-[10px] font-bold uppercase tracking-wide text-[#a0704b] dark:text-[#cd853f]">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {values.map((value) => {
          const isSelected = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(toggleFacetValue(selected, value, values))}
              title={titlePrefix ? `${titlePrefix} ${value}` : undefined}
              aria-pressed={isSelected}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors",
                numeric && "min-w-[26px] tabular-nums",
                isSelected
                  ? "border-amber-600 bg-amber-500 text-white dark:border-amber-500 dark:bg-amber-600"
                  : "border-[#e8d4b8] bg-white text-gray-700 hover:bg-[#f5ede3] dark:border-[#6b5a4a] dark:bg-[#1a1a1a] dark:text-gray-300 dark:hover:bg-[#3d3520]",
              )}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface SummerFilterPopoverProps {
  value: SummerFilterState;
  onChange: (value: SummerFilterState) => void;
  options: SummerFilterOptions;
  /** Sessions surviving the filter, and the total before it applied. */
  matchCount: number;
  totalCount: number;
}

/**
 * Grade / type / lesson filter for the summer course period, collapsed into a
 * single toolbar control. Idle it is one button; active it becomes a summary
 * chip carrying its own clear affordance, so the crowded toolbar pays for at
 * most one control either way.
 *
 * Renders nothing outside the summer course period, where no facet has any
 * value to offer — unless a filter is somehow still set, in which case the
 * control has to stay so it can be cleared.
 */
export function SummerFilterPopover({
  value,
  onChange,
  options,
  matchCount,
  totalCount,
}: SummerFilterPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
    placement: "bottom-start",
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  const isActive = isSummerFilterActive(value);
  const selectedCount = countSummerFilterValues(value);
  const hasOptions =
    options.grades.length > 0 ||
    options.types.length > 0 ||
    options.lessons.length > 0;

  if (!hasOptions && !isActive) return null;

  return (
    <>
      <div
        className={cn(
          "flex items-center rounded-md border transition-colors",
          isActive
            ? "border-amber-500 bg-amber-100 dark:border-amber-600 dark:bg-amber-900/40"
            : "border-[#d4a574] bg-white hover:bg-gray-50 dark:border-[#6b5a4a] dark:bg-[#1a1a1a] dark:hover:bg-gray-800",
        )}
      >
        <button
          ref={refs.setReference}
          {...getReferenceProps()}
          title={isActive ? summerFilterSummary(value) : SUMMER_FILTER_TOOLTIP}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-[#a0704b]",
            isActive
              ? "text-amber-900 dark:text-amber-100"
              : "text-gray-900 dark:text-gray-100",
          )}
        >
          <Sun className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
          <span className="max-w-[110px] truncate sm:max-w-[150px]">
            {summerFilterSummary(value)}
          </span>
          {selectedCount > 1 && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white dark:bg-amber-600">
              {selectedCount}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-[#a0704b] transition-transform dark:text-[#cd853f]",
              isOpen && "rotate-180",
            )}
          />
        </button>
        {isActive && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_SUMMER_FILTER)}
            title="Clear summer filter"
            className="mr-1 rounded p-0.5 text-amber-700 hover:bg-amber-200 hover:text-amber-900 dark:text-amber-300 dark:hover:bg-amber-800/60 dark:hover:text-amber-100"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className={cn(
              "z-[9999] w-[268px] rounded-md border border-[#d4a574] bg-white py-1.5 shadow-lg",
              "dark:border-[#6b5a4a] dark:bg-[#1a1a1a]",
            )}
          >
            <Facet
              label="Grade"
              titlePrefix="Grade"
              values={options.grades}
              selected={value.grades}
              onToggle={(grades) => onChange({ ...value, grades })}
            />
            <Facet
              label="Type"
              titlePrefix="Type"
              values={options.types}
              selected={value.types}
              onToggle={(types) => onChange({ ...value, types })}
            />
            <Facet
              label="Lesson"
              titlePrefix="Lesson"
              numeric
              values={options.lessons}
              selected={value.lessons}
              onToggle={(lessons) => onChange({ ...value, lessons })}
            />

            <div className="mt-1 border-t border-[#e8d4b8] px-3 pt-1.5 dark:border-[#6b5a4a]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-600 dark:text-gray-400">
                  {isActive
                    ? `${matchCount} of ${totalCount} sessions`
                    : `${totalCount} sessions`}
                </span>
                {isActive && (
                  <button
                    type="button"
                    onClick={() => onChange(EMPTY_SUMMER_FILTER)}
                    className="text-[11px] font-semibold text-[#a0704b] hover:underline dark:text-[#cd853f]"
                  >
                    Clear
                  </button>
                )}
              </div>
              {isActive && (
                <p className="mt-1 pb-0.5 text-[10px] leading-snug text-gray-500 dark:text-gray-500">
                  Regular sessions are hidden while a summer filter is on.
                </p>
              )}
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
