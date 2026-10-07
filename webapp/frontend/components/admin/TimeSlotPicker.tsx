"use client";

import { useEffect } from "react";
import { Clock } from "lucide-react";
import { Input, Select } from "@/components/controls";

export type TimeSlotState = {
  useCustom: boolean;
  preset: string;
  start: string;
  end: string;
};

const EMPTY: TimeSlotState = { useCustom: false, preset: "", start: "", end: "" };

/** Seed picker state from a string like "14:00 - 15:30". Picks preset mode
 *  when the string matches a known preset, custom mode for any other HH:MM -
 *  HH:MM string, or an empty preset otherwise. */
export function seedTimeSlotState(
  src: string | null | undefined,
  presetTimeSlots: readonly string[],
): TimeSlotState {
  if (src && presetTimeSlots.includes(src)) {
    return { useCustom: false, preset: src, start: "", end: "" };
  }
  if (src && src.includes(" - ")) {
    const [start, end] = src.split(" - ");
    return { useCustom: true, preset: "", start: start ?? "", end: end ?? "" };
  }
  return EMPTY;
}

export function effectiveTimeSlot(state: TimeSlotState): string {
  return state.useCustom ? `${state.start} - ${state.end}` : state.preset;
}

/** Custom mode is valid only when end > start. Preset mode is always valid. */
export function isTimeSlotValid(state: TimeSlotState): boolean {
  if (!state.useCustom) return true;
  if (!state.start || !state.end) return false;
  return state.end > state.start;
}

interface TimeSlotPickerProps {
  state: TimeSlotState;
  onChange: (next: TimeSlotState) => void;
  presetTimeSlots: readonly string[];
}

/** Preset dropdown + "use custom time" toggle. Summer uses a single
 *  day-agnostic preset list — the dropdown isn't split by weekday/weekend
 *  the way regular-term pickers are. */
export function TimeSlotPicker({ state, onChange, presetTimeSlots }: TimeSlotPickerProps) {
  // Keep the preset selection inside the allowed list. When the list shifts
  // (e.g. caller swaps the source location) or starts empty, snap to the
  // first available preset so the user never sees a stale value.
  useEffect(() => {
    if (state.useCustom) return;
    if (state.preset && !presetTimeSlots.includes(state.preset)) {
      onChange({ ...state, preset: presetTimeSlots[0] ?? "" });
    } else if (!state.preset && presetTimeSlots.length > 0) {
      onChange({ ...state, preset: presetTimeSlots[0] });
    }
  }, [state, presetTimeSlots, onChange]);

  const validCustom = isTimeSlotValid(state);

  if (!state.useCustom) {
    return (
      <div className="space-y-1">
        <div className="relative">
          <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-subtle pointer-events-none z-10" aria-hidden="true" />
          <Select
            value={state.preset}
            onChange={(e) => onChange({ ...state, preset: e.target.value })}
            aria-label="Time slot"
            className="pl-8"
          >
            {presetTimeSlots.map((slot) => (
              <option key={slot} value={slot}>{slot}</option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...state, useCustom: true })}
          className="text-[11px] text-accent-ink hover:underline"
        >
          Use custom time
        </button>
      </div>
    );
  }

  const showInvalid = !validCustom && !!state.start && !!state.end;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          type="time"
          value={state.start}
          onChange={(e) => onChange({ ...state, start: e.target.value })}
          aria-label="Start time"
          aria-invalid={showInvalid || undefined}
          className="flex-1"
        />
        <span className="text-foreground/50 text-xs">to</span>
        <Input
          type="time"
          value={state.end}
          onChange={(e) => onChange({ ...state, end: e.target.value })}
          aria-label="End time"
          aria-invalid={showInvalid || undefined}
          className="flex-1"
        />
      </div>
      {showInvalid && (
        <p className="text-[11px] text-red-700 dark:text-red-400">End time must be after start time.</p>
      )}
      <button
        type="button"
        onClick={() => onChange({ ...state, useCustom: false, start: "", end: "" })}
        className="text-[11px] text-accent-ink hover:underline"
      >
        Use preset time slots
      </button>
    </div>
  );
}
