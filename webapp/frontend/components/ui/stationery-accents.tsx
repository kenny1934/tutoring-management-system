import { cn } from "@/lib/utils";

interface StationeryProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

interface PaperClipProps extends StationeryProps {
  variant?: "silver" | "gold" | "rose-gold";
}

interface PushpinProps extends StationeryProps {
  variant?: "red" | "blue" | "green" | "yellow";
}

const sizeMap = {
  sm: 0.6,
  md: 0.8,
  lg: 1,
};

export function PaperClip({ className, variant = "silver", size = "md" }: PaperClipProps) {
  const scale = sizeMap[size];
  const colors = {
    silver: { main: "#c0c0c0", highlight: "#e8e8e8", shadow: "#808080" },
    gold: { main: "#d4a84b", highlight: "#f0d890", shadow: "#a07830" },
    "rose-gold": { main: "#e8a090", highlight: "#ffd0c0", shadow: "#b87060" },
  };
  const c = colors[variant];

  return (
    <svg
      width={24 * scale}
      height={48 * scale}
      viewBox="0 0 24 48"
      fill="none"
      className={cn("pointer-events-none hidden md:block", className)}
      style={{ filter: "drop-shadow(1px 2px 2px rgba(0,0,0,0.2))" }}
    >
      {/* Paper clip wire - outer loop */}
      <path
        d="M8 4 Q4 4 4 10 L4 38 Q4 44 10 44 L14 44 Q20 44 20 38 L20 14 Q20 8 14 8 L10 8 Q6 8 6 14 L6 34"
        stroke={c.main}
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Highlight */}
      <path
        d="M8 4 Q4 4 4 10 L4 20"
        stroke={c.highlight}
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
        opacity="0.6"
      />
    </svg>
  );
}

export function Pushpin({ className, variant = "red", size = "md" }: PushpinProps) {
  const scale = sizeMap[size];
  const colors = {
    red: { head: "#dc2626", highlight: "#ef4444", shadow: "#991b1b" },
    blue: { head: "#2563eb", highlight: "#3b82f6", shadow: "#1d4ed8" },
    green: { head: "#16a34a", highlight: "#22c55e", shadow: "#15803d" },
    yellow: { head: "#eab308", highlight: "#facc15", shadow: "#ca8a04" },
  };
  const c = colors[variant];

  return (
    <svg
      width={28 * scale}
      height={36 * scale}
      viewBox="0 0 28 36"
      fill="none"
      className={cn("pointer-events-none hidden md:block", className)}
      style={{ filter: "drop-shadow(2px 3px 3px rgba(0,0,0,0.3))" }}
    >
      {/* Pin head - sphere */}
      <circle cx="14" cy="12" r="10" fill={c.head} />
      {/* Highlight on sphere */}
      <ellipse cx="10" cy="8" rx="4" ry="3" fill={c.highlight} opacity="0.5" />
      {/* Pin needle */}
      <path
        d="M14 22 L14 34"
        stroke="#a0a0a0"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Needle tip */}
      <path
        d="M14 32 L14 36"
        stroke="#808080"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Shadow under head */}
      <ellipse cx="14" cy="22" rx="4" ry="1.5" fill="#000" opacity="0.15" />
    </svg>
  );
}

export function BinderClip({ className, size = "md" }: StationeryProps) {
  const scale = sizeMap[size];

  return (
    <svg
      width={40 * scale}
      height={32 * scale}
      viewBox="0 0 40 32"
      fill="none"
      className={cn("pointer-events-none hidden md:block", className)}
      style={{ filter: "drop-shadow(1px 2px 2px rgba(0,0,0,0.25))" }}
    >
      {/* Main clip body */}
      <path
        d="M4 8 L4 24 Q4 28 8 28 L32 28 Q36 28 36 24 L36 8"
        fill="#2d2d2d"
        stroke="#1a1a1a"
        strokeWidth="1"
      />
      {/* Top edge highlight */}
      <rect x="4" y="6" width="32" height="4" rx="1" fill="#3d3d3d" />
      {/* Wire handles */}
      {/* Left handle */}
      <path
        d="M8 8 Q8 2 14 2 L14 6"
        stroke="#808080"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Right handle */}
      <path
        d="M32 8 Q32 2 26 2 L26 6"
        stroke="#808080"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Inner fold line */}
      <line x1="8" y1="16" x2="32" y2="16" stroke="#1a1a1a" strokeWidth="0.5" opacity="0.5" />
    </svg>
  );
}

export function StickyNote({
  className,
  color = "yellow"
}: {
  className?: string;
  color?: "yellow" | "pink" | "blue" | "green";
}) {
  const colors = {
    yellow: { bg: "#fef3c7", border: "#fcd34d", shadow: "#f59e0b" },
    pink: { bg: "#fce7f3", border: "#f9a8d4", shadow: "#ec4899" },
    blue: { bg: "#dbeafe", border: "#93c5fd", shadow: "#3b82f6" },
    green: { bg: "#dcfce7", border: "#86efac", shadow: "#22c55e" },
  };
  const c = colors[color];

  return (
    <div
      className={cn(
        "pointer-events-none hidden md:block w-16 h-16 rounded-sm",
        className
      )}
      style={{
        background: `linear-gradient(135deg, ${c.bg} 0%, ${c.bg} 85%, ${c.border} 100%)`,
        boxShadow: `2px 2px 4px rgba(0,0,0,0.1), inset -1px -1px 0 ${c.shadow}20`,
        transform: "rotate(-2deg)",
      }}
    />
  );
}
