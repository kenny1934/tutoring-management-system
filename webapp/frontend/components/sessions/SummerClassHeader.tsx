import { Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  compactSummerClassLabel,
  formatSummerClassLabel,
  type SummerClassInfo,
} from "@/lib/summer-class-grouping";

interface SummerClassHeaderProps {
  classInfo: SummerClassInfo;
  className?: string;
}

/**
 * Class identity header rendered above a cluster of summer session rows,
 * e.g. "F1 · Type A". States the slot's identity; per-student divergences
 * (own grade, own lesson number) stay on the rows below.
 */
export function SummerClassHeader({ classInfo, className }: SummerClassHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 mt-2 mb-1.5 px-1",
        className,
      )}
    >
      <Sun className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 flex-shrink-0" />
      <span className="text-xs font-semibold text-amber-800 dark:text-amber-200 whitespace-nowrap">
        {formatSummerClassLabel(classInfo)}
      </span>
      <div className="flex-1 border-t border-dashed border-amber-300 dark:border-amber-700/60" />
    </div>
  );
}

interface SummerClassChipProps {
  classInfo: SummerClassInfo;
  className?: string;
}

/**
 * Compact class chip for grid cells, e.g. "F2·A". Rendered on the first
 * row of a summer cluster; adds no vertical space. Null when the slot has
 * no grade/type (e.g. ad-hoc make-up slots).
 */
export function SummerClassChip({ classInfo, className }: SummerClassChipProps) {
  const label = compactSummerClassLabel(classInfo);
  if (!label) return null;

  return (
    <span
      title={formatSummerClassLabel(classInfo)}
      className={cn(
        "inline-flex items-center gap-px px-1 py-px rounded font-bold whitespace-nowrap",
        "text-[7px] leading-tight",
        "bg-amber-100 text-amber-900 border border-amber-400",
        "dark:bg-amber-900/50 dark:text-amber-100 dark:border-amber-600",
        className,
      )}
    >
      <Sun className="h-2 w-2 flex-shrink-0" />
      {label}
    </span>
  );
}
