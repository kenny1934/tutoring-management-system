"use client";

import type { LucideIcon } from "lucide-react";
import { Segmented } from "@/components/controls";

/** The segmented icon toggle that switches an applications page between its
 *  views (list / board / stats). One control for both intakes' pages, so the
 *  look stays in step. */
export function ViewModeToggle<T extends string>({ value, onChange, modes }: {
  value: T;
  onChange: (mode: T) => void;
  modes: { key: T; icon: LucideIcon; label: string }[];
}) {
  return (
    <Segmented
      label="View"
      value={value}
      onChange={onChange}
      options={modes.map(({ key, icon, label }) => ({
        value: key,
        icon,
        title: label,
        // Icon only on screen; the name is still read out.
        label: <span className="sr-only">{label}</span>,
      }))}
    />
  );
}
