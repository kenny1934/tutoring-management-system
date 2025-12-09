"use client";

import { cn } from "@/lib/utils";

interface ProgressRingProps {
  completed: number;
  total: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/**
 * Circular progress ring showing session completion status
 * Uses warm sepia gradient to match dashboard theme
 */
export function ProgressRing({
  completed,
  total,
  size = 48,
  strokeWidth = 4,
  className,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? completed / total : 0;
  const strokeDashoffset = circumference * (1 - progress);

  // Unique ID for the gradient (needed for SVG)
  const gradientId = `progress-ring-gradient-${size}`;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        {/* Gradient definition */}
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a0704b" />
            <stop offset="100%" stopColor="#cd853f" />
          </linearGradient>
        </defs>

        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200 dark:text-gray-700"
        />

        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500 ease-out"
        />
      </svg>

      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
          {completed}
        </span>
        <span className="text-[8px] font-medium text-gray-500 dark:text-gray-400 -mt-0.5">
          /{total}
        </span>
      </div>
    </div>
  );
}

/**
 * Compact variant for header stats - shows just the ring with tooltip
 */
export function CompactProgressRing({
  completed,
  total,
  label = "Sessions",
  className,
}: ProgressRingProps & { label?: string }) {
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div
      className={cn("flex items-center gap-2", className)}
      title={`${completed} of ${total} ${label.toLowerCase()} completed (${progress}%)`}
    >
      <ProgressRing completed={completed} total={total} size={36} strokeWidth={3} />
      <div className="text-xs">
        <div className="font-semibold text-gray-900 dark:text-gray-100">
          {progress}%
        </div>
        <div className="text-gray-500 dark:text-gray-400 text-[10px] -mt-0.5">
          {label}
        </div>
      </div>
    </div>
  );
}
