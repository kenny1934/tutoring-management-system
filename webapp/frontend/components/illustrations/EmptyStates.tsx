"use client";

import { cn } from "@/lib/utils";

interface IllustrationProps {
  className?: string;
}

/**
 * Empty state illustration for "No sessions today"
 * A relaxed coffee cup with steam - taking a break vibe
 */
export function NoSessionsToday({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 120 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-32 h-28", className)}
    >
      {/* Coffee cup body */}
      <path
        d="M30 45 L35 85 Q37 90 45 90 L75 90 Q83 90 85 85 L90 45 Z"
        fill="#fef9f3"
        stroke="#a0704b"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Cup handle */}
      <path
        d="M90 50 Q105 50 105 65 Q105 75 90 75"
        fill="none"
        stroke="#a0704b"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Coffee surface */}
      <ellipse
        cx="60"
        cy="50"
        rx="28"
        ry="8"
        fill="#d4a574"
        opacity="0.6"
      />
      {/* Steam lines - wavy */}
      <path
        d="M45 35 Q48 28 45 22 Q42 16 45 10"
        fill="none"
        stroke="#cd853f"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.7"
      >
        <animate
          attributeName="d"
          values="M45 35 Q48 28 45 22 Q42 16 45 10;M45 35 Q42 28 45 22 Q48 16 45 10;M45 35 Q48 28 45 22 Q42 16 45 10"
          dur="2s"
          repeatCount="indefinite"
        />
      </path>
      <path
        d="M60 32 Q63 25 60 18 Q57 11 60 5"
        fill="none"
        stroke="#cd853f"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.7"
      >
        <animate
          attributeName="d"
          values="M60 32 Q63 25 60 18 Q57 11 60 5;M60 32 Q57 25 60 18 Q63 11 60 5;M60 32 Q63 25 60 18 Q57 11 60 5"
          dur="2.3s"
          repeatCount="indefinite"
        />
      </path>
      <path
        d="M75 35 Q78 28 75 22 Q72 16 75 10"
        fill="none"
        stroke="#cd853f"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.7"
      >
        <animate
          attributeName="d"
          values="M75 35 Q78 28 75 22 Q72 16 75 10;M75 35 Q72 28 75 22 Q78 16 75 10;M75 35 Q78 28 75 22 Q72 16 75 10"
          dur="1.8s"
          repeatCount="indefinite"
        />
      </path>
      {/* Saucer */}
      <ellipse
        cx="60"
        cy="92"
        rx="35"
        ry="6"
        fill="none"
        stroke="#a0704b"
        strokeWidth="2"
      />
    </svg>
  );
}

/**
 * Empty state illustration for "No upcoming tests"
 * A happy notebook with a checkmark - all caught up
 */
export function NoUpcomingTests({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 120 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-32 h-28", className)}
    >
      {/* Notebook body */}
      <rect
        x="25"
        y="15"
        width="70"
        height="75"
        rx="4"
        fill="#fef9f3"
        stroke="#a0704b"
        strokeWidth="2.5"
      />
      {/* Notebook spine */}
      <line
        x1="35"
        y1="15"
        x2="35"
        y2="90"
        stroke="#d4a574"
        strokeWidth="2"
      />
      {/* Spiral holes */}
      {[25, 40, 55, 70].map((y) => (
        <circle
          key={y}
          cx="25"
          cy={y}
          r="3"
          fill="#fef9f3"
          stroke="#a0704b"
          strokeWidth="1.5"
        />
      ))}
      {/* Ruled lines */}
      {[35, 48, 61, 74].map((y) => (
        <line
          key={y}
          x1="42"
          y1={y}
          x2="88"
          y2={y}
          stroke="#e8d4b8"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      ))}
      {/* Big checkmark */}
      <path
        d="M50 52 L62 65 L82 38"
        fill="none"
        stroke="#22c55e"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Sparkles around checkmark */}
      <g opacity="0.8">
        <path
          d="M42 35 L44 30 L46 35 L51 33 L46 35 L44 40 L42 35 L37 37 Z"
          fill="#cd853f"
        >
          <animate
            attributeName="opacity"
            values="0.8;0.4;0.8"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </path>
        <path
          d="M88 48 L90 43 L92 48 L97 46 L92 48 L90 53 L88 48 L83 50 Z"
          fill="#cd853f"
        >
          <animate
            attributeName="opacity"
            values="0.4;0.8;0.4"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </path>
        <path
          d="M75 22 L76 18 L77 22 L81 21 L77 22 L76 26 L75 22 L71 23 Z"
          fill="#cd853f"
        >
          <animate
            attributeName="opacity"
            values="0.6;1;0.6"
            dur="1.2s"
            repeatCount="indefinite"
          />
        </path>
      </g>
    </svg>
  );
}

/**
 * Empty state illustration for "Search no results"
 * A curious magnifying glass looking around
 */
export function SearchNoResults({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 120 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-32 h-28", className)}
    >
      {/* Magnifying glass lens */}
      <circle
        cx="50"
        cy="40"
        r="28"
        fill="#fef9f3"
        stroke="#a0704b"
        strokeWidth="3"
      />
      {/* Glass reflection */}
      <path
        d="M35 28 Q30 35 32 45"
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* Handle */}
      <path
        d="M70 60 L95 88"
        stroke="#a0704b"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M70 60 L95 88"
        stroke="#d4a574"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Confused face inside lens */}
      {/* Eyes - looking around */}
      <g>
        <circle cx="42" cy="38" r="4" fill="#a0704b" />
        <circle cx="58" cy="38" r="4" fill="#a0704b" />
        {/* Animated pupils */}
        <circle cx="43" cy="37" r="1.5" fill="#fef9f3">
          <animate
            attributeName="cx"
            values="43;41;44;43"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="59" cy="37" r="1.5" fill="#fef9f3">
          <animate
            attributeName="cx"
            values="59;57;60;59"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
      </g>
      {/* Eyebrows - raised in confusion */}
      <path
        d="M37 30 Q42 28 47 31"
        fill="none"
        stroke="#a0704b"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M53 31 Q58 28 63 30"
        fill="none"
        stroke="#a0704b"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Mouth - confused squiggle */}
      <path
        d="M43 52 Q46 50 50 52 Q54 54 57 52"
        fill="none"
        stroke="#a0704b"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Question marks floating */}
      <text
        x="78"
        y="25"
        fill="#cd853f"
        fontSize="14"
        fontFamily="serif"
        fontWeight="bold"
        opacity="0.7"
      >
        ?
        <animate
          attributeName="y"
          values="25;22;25"
          dur="1.5s"
          repeatCount="indefinite"
        />
      </text>
      <text
        x="88"
        y="35"
        fill="#cd853f"
        fontSize="10"
        fontFamily="serif"
        fontWeight="bold"
        opacity="0.5"
      >
        ?
        <animate
          attributeName="y"
          values="35;33;35"
          dur="1.8s"
          repeatCount="indefinite"
        />
      </text>
    </svg>
  );
}

/**
 * Empty state illustration for "No students found"
 * Empty desk with a pencil holder
 */
export function NoStudentsFound({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 120 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-32 h-28", className)}
    >
      {/* Desk surface */}
      <rect
        x="15"
        y="60"
        width="90"
        height="8"
        rx="2"
        fill="#d4a574"
        stroke="#a0704b"
        strokeWidth="2"
      />
      {/* Desk legs */}
      <rect x="20" y="68" width="6" height="25" fill="#a0704b" rx="1" />
      <rect x="94" y="68" width="6" height="25" fill="#a0704b" rx="1" />
      {/* Pencil holder */}
      <path
        d="M50 35 L45 60 L65 60 L60 35 Z"
        fill="#fef9f3"
        stroke="#a0704b"
        strokeWidth="2"
      />
      {/* Pencils */}
      <line
        x1="52"
        y1="22"
        x2="52"
        y2="50"
        stroke="#f59e0b"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <polygon points="52,18 50,22 54,22" fill="#ffb74d" />
      <line
        x1="56"
        y1="28"
        x2="56"
        y2="50"
        stroke="#ef4444"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <polygon points="56,24 54,28 58,28" fill="#f87171" />
      {/* Paper on desk - tilted */}
      <rect
        x="70"
        y="45"
        width="25"
        height="15"
        rx="1"
        fill="#fef9f3"
        stroke="#e8d4b8"
        strokeWidth="1.5"
        transform="rotate(-5 82 52)"
      />
      {/* Lines on paper */}
      <line
        x1="73"
        y1="50"
        x2="92"
        y2="49"
        stroke="#e8d4b8"
        strokeWidth="1"
      />
      <line
        x1="73"
        y1="54"
        x2="90"
        y2="53"
        stroke="#e8d4b8"
        strokeWidth="1"
      />
      {/* Dust motes - subtle */}
      <circle cx="35" cy="50" r="1" fill="#d4a574" opacity="0.4">
        <animate
          attributeName="cy"
          values="50;47;50"
          dur="3s"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="85" cy="35" r="1.5" fill="#d4a574" opacity="0.3">
        <animate
          attributeName="cy"
          values="35;32;35"
          dur="2.5s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}

/**
 * Generic empty state - a friendly cloud
 * For any "nothing here" scenarios
 */
export function EmptyCloud({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-32 h-24", className)}
    >
      {/* Main cloud shape */}
      <path
        d="M25 55
           Q15 55 15 45 Q15 35 28 35
           Q30 20 50 20 Q70 20 72 35
           Q85 30 90 40 Q95 50 85 55
           Z"
        fill="#fef9f3"
        stroke="#d4a574"
        strokeWidth="2.5"
      />
      {/* Cloud face - sleepy/content */}
      <path
        d="M38 42 Q42 40 46 42"
        fill="none"
        stroke="#a0704b"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M56 42 Q60 40 64 42"
        fill="none"
        stroke="#a0704b"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Blush */}
      <circle cx="35" cy="48" r="4" fill="#f9a8d4" opacity="0.4" />
      <circle cx="67" cy="48" r="4" fill="#f9a8d4" opacity="0.4" />
      {/* Gentle smile */}
      <path
        d="M45 52 Q51 56 57 52"
        fill="none"
        stroke="#a0704b"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Z's for sleeping/quiet */}
      <text
        x="78"
        y="30"
        fill="#cd853f"
        fontSize="10"
        fontFamily="serif"
        fontStyle="italic"
        opacity="0.6"
      >
        z
        <animate
          attributeName="opacity"
          values="0.6;0.3;0.6"
          dur="2s"
          repeatCount="indefinite"
        />
      </text>
      <text
        x="85"
        y="22"
        fill="#cd853f"
        fontSize="8"
        fontFamily="serif"
        fontStyle="italic"
        opacity="0.4"
      >
        z
        <animate
          attributeName="opacity"
          values="0.4;0.2;0.4"
          dur="2.3s"
          repeatCount="indefinite"
        />
      </text>
    </svg>
  );
}
