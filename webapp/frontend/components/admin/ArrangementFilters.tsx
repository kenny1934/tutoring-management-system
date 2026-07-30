"use client";

import { cn } from "@/lib/utils";

// Shared slot-content filter controls for the arrangement surfaces (regular +
// summer arrangement grids and the summer session calendar). Kept atomic — each
// surface composes its own filter row from these because the attribute set
// differs (regular filters a C/E stream, summer an A/B course type).

// Small chip for a filter group (grade / stream / course type / has-space),
// styled to match the day chips that sit alongside it.
export function FilterChip({
  label,
  active,
  onClick,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
        active
          ? "bg-[#a0704b] text-white"
          : "bg-gray-100 dark:bg-gray-800 text-foreground/50 hover:text-foreground/70"
      )}
    >
      {label}
    </button>
  );
}

// Compact tutor filter dropdown. Renders nothing when there are no tutors to
// pick from. `color-scheme` is flipped in dark mode because :root forces
// `light`, which would otherwise render the native control and its option popup
// on a white base (the translucent active fill then looks white).
export function TutorFilterSelect({
  value,
  onChange,
  tutors,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  tutors: { id: number; name: string }[];
}) {
  if (tutors.length === 0) return null;
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className={cn(
        "ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium max-w-[9rem] cursor-pointer transition-colors border [color-scheme:light] dark:[color-scheme:dark]",
        value !== null
          ? "border-[#a0704b] bg-[#a0704b]/10 dark:bg-[#a0704b]/25 text-[#a0704b] dark:text-[#d9a978]"
          : "border-transparent bg-gray-100 dark:bg-gray-800 text-foreground/60 hover:text-foreground/80"
      )}
      aria-label="Filter by tutor"
      title="Show only one tutor's slots"
    >
      <option value="">All tutors</option>
      {tutors.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
