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
  const isCustom = pageMode === "custom";

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {/* Simple Range Mode */}
      <label
        className={cn(
          "flex items-center gap-2 cursor-pointer transition-opacity",
          !isSimple && "opacity-50"
        )}
      >
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
        <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">Range:</span>
        <input
          type="number"
          value={pageStart}
          onChange={(e) => {
            if (!isSimple) {
              onPageModeChange("simple");
              onComplexPagesChange("");
            }
            onPageStartChange(e.target.value);
          }}
          onFocus={onFocus}
          placeholder="From"
          min="1"
          disabled={!isSimple}
          className={cn(
            inputClass,
            "text-xs py-1 w-16",
            !isSimple && "opacity-50 cursor-not-allowed",
            pageStartError && "border-red-500 ring-1 ring-red-500"
          )}
        />
        <span className="text-xs text-gray-400">–</span>
        <input
          type="number"
          value={pageEnd}
          onChange={(e) => {
            if (!isSimple) {
              onPageModeChange("simple");
              onComplexPagesChange("");
            }
            onPageEndChange(e.target.value);
          }}
          onFocus={onFocus}
          placeholder="To"
          min="1"
          disabled={!isSimple}
          className={cn(
            inputClass,
            "text-xs py-1 w-16",
            !isSimple && "opacity-50 cursor-not-allowed",
            pageEndError && "border-red-500 ring-1 ring-red-500"
          )}
        />
      </label>

      {/* Custom Range Mode */}
      <label
        className={cn(
          "flex items-center gap-2 cursor-pointer transition-opacity flex-1 min-w-[180px]",
          !isCustom && "opacity-50"
        )}
      >
        <input
          type="radio"
          name={radioName}
          checked={isCustom}
          onChange={() => {
            onPageModeChange("custom");
            onPageStartChange("");
            onPageEndChange("");
          }}
          className="text-amber-500 focus:ring-amber-400"
        />
        <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">Custom:</span>
        <input
          type="text"
          value={complexPages}
          onChange={(e) => {
            if (!isCustom) {
              onPageModeChange("custom");
              onPageStartChange("");
              onPageEndChange("");
            }
            onComplexPagesChange(e.target.value);
          }}
          onFocus={onFocus}
          placeholder="e.g. 1,3,5-7"
          disabled={!isCustom}
          className={cn(
            inputClass,
            "text-xs py-1 flex-1",
            !isCustom && "opacity-50 cursor-not-allowed",
            complexPagesError && "border-red-500 ring-1 ring-red-500"
          )}
          title="Custom page range (e.g., 1,3,5-7)"
        />
      </label>
    </div>
  );
}
