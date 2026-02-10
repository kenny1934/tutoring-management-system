"use client";

import { cn } from "@/lib/utils";

interface ExercisePageRangeInputProps {
  radioName: string;
  pageMode: "simple" | "custom";
  pageStart: string;
  pageEnd: string;
  complexPages: string;
  onPageModeChange: (mode: "simple" | "custom") => void;
  onPageStartChange: (value: string) => void;
  onPageEndChange: (value: string) => void;
  onComplexPagesChange: (value: string) => void;
  onFocus?: () => void;
  inputClass?: string;
  pageStartError?: boolean;
  pageEndError?: boolean;
  complexPagesError?: boolean;
}

export function ExercisePageRangeInput({
  radioName,
  pageMode,
  pageStart,
  pageEnd,
  complexPages,
  onPageModeChange,
  onPageStartChange,
  onPageEndChange,
  onComplexPagesChange,
  onFocus,
  inputClass = "",
  pageStartError,
  pageEndError,
  complexPagesError,
}: ExercisePageRangeInputProps) {
  const isSimple = pageMode === "simple";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Radio: Range */}
      <label className="flex items-center gap-1 cursor-pointer">
        <input
          type="radio"
          name={radioName}
          checked={isSimple}
          onChange={() => {
            onPageModeChange("simple");
            onComplexPagesChange("");
          }}
          className="text-amber-500 focus:ring-amber-400"
        />
        <span className="text-xs text-gray-600 dark:text-gray-400">Range</span>
      </label>

      {/* Radio: Custom */}
      <label className="flex items-center gap-1 cursor-pointer">
        <input
          type="radio"
          name={radioName}
          checked={!isSimple}
          onChange={() => {
            onPageModeChange("custom");
            onPageStartChange("");
            onPageEndChange("");
          }}
          className="text-amber-500 focus:ring-amber-400"
        />
        <span className="text-xs text-gray-600 dark:text-gray-400">Custom</span>
      </label>

      {/* Conditional input: only show the active mode's fields */}
      {isSimple ? (
        <>
          <input
            type="number"
            value={pageStart}
            onChange={(e) => onPageStartChange(e.target.value)}
            onFocus={onFocus}
            placeholder="From"
            min="1"
            className={cn(
              inputClass,
              "text-xs py-1 w-14 md:w-[4.5rem]",
              pageStartError && "border-red-500 ring-1 ring-red-500"
            )}
          />
          <span className="text-xs text-gray-400">–</span>
          <input
            type="number"
            value={pageEnd}
            onChange={(e) => onPageEndChange(e.target.value)}
            onFocus={onFocus}
            placeholder="To"
            min="1"
            className={cn(
              inputClass,
              "text-xs py-1 w-14 md:w-[4.5rem]",
              pageEndError && "border-red-500 ring-1 ring-red-500"
            )}
          />
        </>
      ) : (
        <input
          type="text"
          value={complexPages}
          onChange={(e) => onComplexPagesChange(e.target.value)}
          onFocus={onFocus}
          placeholder="e.g. 1,3,5-7"
          className={cn(
            inputClass,
            "text-xs py-1 flex-1 min-w-[100px]",
            complexPagesError && "border-red-500 ring-1 ring-red-500"
          )}
          title="Custom page range (e.g., 1,3,5-7)"
        />
      )}
    </div>
  );
}
