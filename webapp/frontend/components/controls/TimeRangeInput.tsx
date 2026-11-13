"use client";

import { useId } from "react";
import styles from "./TimeRangeInput.module.css";
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
  const startId = id || `${generatedId}-start`;
  const endId = `${id || generatedId}-end`;
  const errorId = `${id || generatedId}-error`;
  const [start = "", end = ""] = normaliseTimeSlot(value).split(/\s*-\s*/);
  const invalid = !!value && !parseTimeRange(value);
  return (
    <div className={`flex-1 min-w-0 space-y-1 ${styles.root}`}>
      <div className={styles.clocks}>
        <label htmlFor={startId} className="min-w-0 space-y-1">
          <span className="block text-xs text-ink-subtle">Start</span>
          <Input id={startId} type="time" size={size} value={start} aria-label="Start time"
            aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
            onChange={(event) => onChange(`${event.target.value} - ${end}`)} className="w-full min-w-0" />
        </label>
        <span aria-hidden="true" className="self-end pb-2 text-ink-subtle text-xs">to</span>
        <label htmlFor={endId} className="min-w-0 space-y-1">
          <span className="block text-xs text-ink-subtle">End</span>
          <Input id={endId} type="time" size={size} value={end} aria-label="End time"
            aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
            onChange={(event) => onChange(`${start} - ${event.target.value}`)} className="w-full min-w-0" />
        </label>
      </div>
      {invalid && <p id={errorId} role="alert" className="text-xs text-red-600">Enter both times. End time must be after start time.</p>}
    </div>
  );
}
