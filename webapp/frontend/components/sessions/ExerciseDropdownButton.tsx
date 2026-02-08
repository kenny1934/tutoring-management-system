"use client";

import { useState, useRef, useEffect } from "react";
import { PenTool, Home, ChevronDown, Download, Printer, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExerciseDropdownButtonProps {
  exerciseType: "CW" | "HW";
  onAssign: () => void;
  onDownload: () => void;
  onPrint: () => void;
  hasExercises: boolean;
  isProcessing?: boolean;
  dropUp?: boolean;
}

export function ExerciseDropdownButton({
  exerciseType,
  onAssign,
  onDownload,
  onPrint,
  hasExercises,
  isProcessing = false,
  dropUp = false,
}: ExerciseDropdownButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const isCW = exerciseType === "CW";
  const Icon = isCW ? PenTool : Home;
  const baseColors = isCW
    ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
    : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400";
  const hoverColors = isCW
    ? "hover:bg-red-200 dark:hover:bg-red-900/50"
    : "hover:bg-blue-200 dark:hover:bg-blue-900/50";

  return (
    <div ref={ref} className="relative">
      <div className={cn("flex items-center rounded text-[10px] font-medium", baseColors)}>
        {/* Main button - Assign */}
        <button
          onClick={onAssign}
          disabled={isProcessing}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-l",
            isProcessing ? "opacity-50 cursor-wait" : hoverColors
          )}
          title={`Assign ${exerciseType === "CW" ? "Classwork" : "Homework"}`}
        >
          {isProcessing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Icon className="h-3 w-3" />
          )}
          <span className="hidden xs:inline">{exerciseType}</span>
        </button>

        {/* Divider + Chevron */}
        <button
          onClick={() => setOpen(!open)}
          disabled={isProcessing}
          className={cn(
            "flex items-center px-0.5 py-1 rounded-r border-l",
            isCW
              ? "border-red-300 dark:border-red-700"
              : "border-blue-300 dark:border-blue-700",
            isProcessing ? "opacity-50 cursor-wait" : hoverColors
          )}
          title="More actions"
        >
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
      </div>

      {/* Dropdown menu */}
      {open && (
        <div
          className={cn(
            "absolute z-50 min-w-[140px] rounded-md shadow-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 py-1",
            dropUp ? "bottom-full mb-1" : "top-full mt-1",
            "right-0"
          )}
        >
          <button
            onClick={() => {
              setOpen(false);
              onDownload();
            }}
            disabled={!hasExercises}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-[11px]",
              hasExercises
                ? "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                : "text-gray-400 dark:text-gray-600 cursor-not-allowed"
            )}
          >
            <Download className="h-3 w-3" />
            Download {exerciseType}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onPrint();
            }}
            disabled={!hasExercises}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-[11px]",
              hasExercises
                ? "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                : "text-gray-400 dark:text-gray-600 cursor-not-allowed"
            )}
          >
            <Printer className="h-3 w-3" />
            Print {exerciseType}
          </button>
          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          <button
            onClick={() => {
              setOpen(false);
              onAssign();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Icon className="h-3 w-3" />
            Assign {exerciseType}
          </button>
        </div>
      )}
    </div>
  );
}
