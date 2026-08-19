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

// Compact dropdown for a filter that has too many values for chips (tutors,
// schools). Styled to sit in the same row as FilterChip. `color-scheme` is
// flipped in dark mode because :root forces `light`, which would otherwise
// render the native control and its option popup on a white base. The active
// fill is solid, matching the active FilterChip: a translucent fill sits on
// the native control's own base, which browsers paint light regardless of the
// page behind it.
export function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  title,
  className,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  options: { value: string; label: string }[];
  /** Shown as the empty option and while nothing is selected. */
  placeholder: string;
  ariaLabel: string;
  title?: string;
  /** Extra classes, typically a max width. */
  className?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={cn(
        "ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors border [color-scheme:light] dark:[color-scheme:dark]",
        value !== null
          ? "border-[#a0704b] bg-[#a0704b] text-white"
          : "border-transparent bg-gray-100 dark:bg-gray-800 text-foreground/60 hover:text-foreground/80",
        className
      )}
      aria-label={ariaLabel}
      title={title}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// The tutor filter, on every arrangement surface. Renders nothing when there
// are no tutors to pick from.
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
    <FilterSelect
      value={value !== null ? String(value) : null}
      onChange={(v) => onChange(v ? Number(v) : null)}
      options={tutors.map((t) => ({ value: String(t.id), label: t.name }))}
      placeholder="All tutors"
      ariaLabel="Filter by tutor"
      title="Show only one tutor's slots"
      className="max-w-[9rem]"
    />
  );
}
