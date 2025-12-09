"use client";

import { cn } from "@/lib/utils";

interface AccentProps {
  className?: string;
}

/**
 * Small decorative accent for the Sessions card header
 * A friendly calendar with a subtle wave
 */
export function SessionsAccent({ className }: AccentProps) {
  return (
    <svg
      viewBox="0 0 40 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-10 h-8", className)}
    >
      {/* Calendar base */}
      <rect
        x="4"
        y="6"
        width="28"
        height="22"
        rx="3"
        fill="#fef9f3"
        stroke="#a0704b"
        strokeWidth="1.5"
      />
      {/* Calendar top bar */}
      <rect x="4" y="6" width="28" height="7" rx="3" fill="#d4a574" />
      {/* Calendar rings */}
      <rect x="10" y="3" width="2" height="6" rx="1" fill="#a0704b" />
      <rect x="24" y="3" width="2" height="6" rx="1" fill="#a0704b" />
      {/* Calendar dots for days */}
      <circle cx="12" cy="18" r="1.5" fill="#d4a574" />
      <circle cx="18" cy="18" r="1.5" fill="#d4a574" />
      <circle cx="24" cy="18" r="1.5" fill="#a0704b" />
      <circle cx="12" cy="24" r="1.5" fill="#d4a574" />
      <circle cx="18" cy="24" r="1.5" fill="#d4a574" />
      {/* Checkmark on today */}
      <path
        d="M22 23 L24 25 L28 21"
        fill="none"
        stroke="#22c55e"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Small decorative accent for the Tests calendar card
 * A pencil at an angle with a sparkle
 */
export function TestsAccent({ className }: AccentProps) {
  return (
    <svg
      viewBox="0 0 40 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-10 h-8", className)}
    >
      {/* Pencil body - yellow parallelogram */}
      <path
        d="M10 24 L26 8 L28 10 L12 26 Z"
        fill="#f59e0b"
      />
      {/* Pencil stripe */}
      <path
        d="M11 25 L27 9 L28 10 L12 26 Z"
        fill="#fbbf24"
      />
      {/* Wood/sharpened part - trapezoid */}
      <path
        d="M10 24 L7 27 L9 29 L12 26 Z"
        fill="#d4a574"
      />
      {/* Pencil tip - equilateral triangle (60° angles) */}
      <path
        d="M7 27 L6.27 29.73 L9 29 Z"
        fill="#8b4513"
      />
      {/* Metal band */}
      <path
        d="M26 8 L27 7 L29 9 L28 10 Z"
        fill="#9ca3af"
      />
      {/* Eraser - pink diamond */}
      <path
        d="M27 7 L31 3 L33 5 L29 9 Z"
        fill="#f9a8d4"
      />
    </svg>
  );
}

/**
 * Small decorative accent for Grade Distribution chart
 * A graduation cap with tassel
 */
export function GradeAccent({ className }: AccentProps) {
  return (
    <svg
      viewBox="0 0 40 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-10 h-8", className)}
    >
      {/* Cap top (mortarboard) */}
      <polygon
        points="20,4 38,12 20,20 2,12"
        fill="#a0704b"
      />
      {/* Cap top highlight */}
      <polygon
        points="20,4 29,8 20,12 11,8"
        fill="#cd853f"
        opacity="0.5"
      />
      {/* Button on top */}
      <circle cx="20" cy="12" r="2" fill="#d4a574" />
      {/* Tassel string */}
      <path
        d="M20 12 Q24 14 26 18 Q28 22 30 26"
        fill="none"
        stroke="#d4a574"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Tassel end */}
      <path
        d="M28 24 L30 26 L32 24 L30 28 Z"
        fill="#cd853f"
      />
      <line x1="29" y1="26" x2="29" y2="30" stroke="#cd853f" strokeWidth="1" />
      <line x1="31" y1="26" x2="31" y2="29" stroke="#cd853f" strokeWidth="1" />
      {/* Cap base/head part hint */}
      <ellipse cx="20" cy="18" rx="10" ry="3" fill="#8b6f47" opacity="0.4" />
    </svg>
  );
}

/**
 * Small decorative accent for School Distribution chart
 * A simple school building with flag
 */
export function SchoolAccent({ className }: AccentProps) {
  return (
    <svg
      viewBox="0 0 40 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-10 h-8", className)}
    >
      {/* Main building */}
      <rect
        x="8"
        y="14"
        width="24"
        height="14"
        fill="#fef9f3"
        stroke="#a0704b"
        strokeWidth="1.5"
      />
      {/* Roof/pediment */}
      <polygon
        points="6,14 20,6 34,14"
        fill="#d4a574"
        stroke="#a0704b"
        strokeWidth="1"
      />
      {/* Door */}
      <rect x="17" y="20" width="6" height="8" rx="1" fill="#a0704b" />
      {/* Windows */}
      <rect x="10" y="17" width="4" height="4" rx="0.5" fill="#87ceeb" stroke="#a0704b" strokeWidth="0.5" />
      <rect x="26" y="17" width="4" height="4" rx="0.5" fill="#87ceeb" stroke="#a0704b" strokeWidth="0.5" />
      {/* Flag pole */}
      <line x1="20" y1="2" x2="20" y2="8" stroke="#8b6f47" strokeWidth="1" />
      {/* Flag */}
      <path
        d="M20 2 L28 4 L20 6 Z"
        fill="#ef4444"
      >
        <animate
          attributeName="d"
          values="M20 2 L28 4 L20 6 Z;M20 2 L27 4.5 L20 6 Z;M20 2 L28 4 L20 6 Z"
          dur="2s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}

/**
 * Small decorative accent for charts/statistics
 * A bar chart with upward trend
 */
export function StatsAccent({ className }: AccentProps) {
  return (
    <svg
      viewBox="0 0 40 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-10 h-8", className)}
    >
      {/* Chart bars */}
      <rect x="6" y="18" width="6" height="10" rx="1" fill="#d4a574" />
      <rect x="14" y="12" width="6" height="16" rx="1" fill="#a0704b" />
      <rect x="22" y="8" width="6" height="20" rx="1" fill="#cd853f" />
      {/* Trend line */}
      <path
        d="M8 16 L16 10 L24 6 L32 2"
        fill="none"
        stroke="#22c55e"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="2 2"
      />
      {/* Arrow head */}
      <polygon
        points="30,4 34,2 32,6"
        fill="#22c55e"
      />
    </svg>
  );
}

/**
 * Decorative corner flourish for cards
 * A subtle botanical/leaf pattern
 */
export function CornerFlourish({ className }: AccentProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-12 h-12", className)}
    >
      {/* Main leaf curve */}
      <path
        d="M4 44 Q12 36 20 28 Q28 20 36 12 Q44 4 48 0"
        fill="none"
        stroke="#d4a574"
        strokeWidth="1"
        opacity="0.4"
      />
      {/* Small leaves */}
      <path
        d="M8 40 Q14 38 12 32"
        fill="none"
        stroke="#d4a574"
        strokeWidth="1"
        opacity="0.3"
      />
      <path
        d="M16 32 Q22 30 20 24"
        fill="none"
        stroke="#d4a574"
        strokeWidth="1"
        opacity="0.3"
      />
      <path
        d="M24 24 Q30 22 28 16"
        fill="none"
        stroke="#d4a574"
        strokeWidth="1"
        opacity="0.3"
      />
      {/* Dots */}
      <circle cx="6" cy="42" r="1.5" fill="#d4a574" opacity="0.3" />
      <circle cx="14" cy="34" r="1" fill="#d4a574" opacity="0.3" />
      <circle cx="22" cy="26" r="1.5" fill="#d4a574" opacity="0.3" />
    </svg>
  );
}

/**
 * Decorative header accent - small sun/radial pattern
 */
export function SunburstAccent({ className }: AccentProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-8 h-8", className)}
    >
      {/* Central circle */}
      <circle cx="16" cy="16" r="6" fill="#cd853f" opacity="0.3" />
      <circle cx="16" cy="16" r="4" fill="#a0704b" opacity="0.4" />
      {/* Rays */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
        <line
          key={angle}
          x1="16"
          y1="16"
          x2={16 + 10 * Math.cos((angle * Math.PI) / 180)}
          y2={16 + 10 * Math.sin((angle * Math.PI) / 180)}
          stroke="#d4a574"
          strokeWidth="1"
          strokeLinecap="round"
          opacity={i % 2 === 0 ? 0.4 : 0.2}
        />
      ))}
    </svg>
  );
}
