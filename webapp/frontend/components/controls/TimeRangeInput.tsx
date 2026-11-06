"use client";

import { useId } from "react";
import { Input } from "@/components/controls";
import { normaliseTimeSlot, parseTimeRange } from "@/lib/time-slots";

interface TimeRangeInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md";
}

/** Custom class times are assembled from two clocks so staff never type separators. */
export function TimeRangeInput({ id, value, onChange, size }: TimeRangeInputProps) {
  const generatedId = useId();
  const errorId = `${id || generatedId}-error`;
  const [start = "", end = ""] = normaliseTimeSlot(value).split(/\s*-\s*/);
  const invalid = !!value && !parseTimeRange(value);
  return (
    <div className="flex-1 min-w-0 space-y-1">
      <div className="flex items-center gap-1">
        <Input id={id} type="time" size={size} value={start} aria-label="Start time"
          aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
          onChange={(event) => onChange(`${event.target.value} - ${end}`)} className="flex-1 min-w-0" />
        <span className="text-foreground/50 text-xs">to</span>
        <Input type="time" size={size} value={end} aria-label="End time"
          aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
          onChange={(event) => onChange(`${start} - ${event.target.value}`)} className="flex-1 min-w-0" />
      </div>
      {invalid && <p id={errorId} role="alert" className="text-xs text-red-600">Enter both times. End time must be after start time.</p>}
    </div>
  );
}
