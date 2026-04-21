import { cn } from "@/lib/utils";

interface LessonNumberBadgeProps {
  lessonNumber: number | null | undefined;
  size?: "xs" | "sm" | "md";
  className?: string;
}

export function LessonNumberBadge({
  lessonNumber,
  size = "sm",
  className,
}: LessonNumberBadgeProps) {
  if (lessonNumber == null) return null;

  return (
    <span
      title={`Lesson ${lessonNumber}`}
      className={cn(
        "inline-flex items-center justify-center rounded font-semibold tabular-nums",
        "bg-amber-100 text-amber-900 border border-amber-300",
        "dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-700/60",
        size === "xs" && "px-1 py-0 text-[9px] leading-[14px] min-w-[16px]",
        size === "sm" && "px-1.5 py-0 text-[10px] leading-[16px] min-w-[18px]",
        size === "md" && "px-2 py-0.5 text-xs leading-tight min-w-[22px]",
        className,
      )}
    >
      L{lessonNumber}
    </span>
  );
}
