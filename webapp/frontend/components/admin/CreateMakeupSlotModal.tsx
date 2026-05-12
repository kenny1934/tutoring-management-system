"use client";

import { useState, useEffect, useMemo } from "react";
import {
  useFloating,
  useDismiss,
  useInteractions,
  FloatingOverlay,
  FloatingFocusManager,
  FloatingPortal,
} from "@floating-ui/react";
import { CalendarPlus, Loader2, AlertCircle, Clock, ChevronDown } from "lucide-react";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import { summerAPI } from "@/lib/api";
import { LOCATION_TO_CODE } from "@/lib/summer-utils";
import { useToast } from "@/contexts/ToastContext";

interface CreateMakeupSlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  configId: number;
  location: string;
  courseStartDate: string;
  courseEndDate: string;
  /** Prefilled when opened from an empty calendar cell. */
  initialDate?: string;
  initialTime?: string;
  /** Preset time-slot dropdown options (summer config-driven). */
  presetTimeSlots: readonly string[];
}

export function CreateMakeupSlotModal({
  isOpen,
  onClose,
  onCreated,
  configId,
  location,
  courseStartDate,
  courseEndDate,
  initialDate,
  initialTime,
  presetTimeSlots,
}: CreateMakeupSlotModalProps) {
  const { showToast } = useToast();
  const [date, setDate] = useState(initialDate ?? "");
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [presetTime, setPresetTime] = useState<string>("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [tutorId, setTutorId] = useState<number | null>(null);
  const [maxStudents, setMaxStudents] = useState(8);
  const [submitting, setSubmitting] = useState(false);

  // Seed time inputs. If initialTime matches a known preset, default to
  // dropdown mode showing that slot. If it's a free-text range, fall back to
  // custom mode. Otherwise leave preset blank for the day-of-week auto-pick
  // effect below to populate.
  useEffect(() => {
    if (isOpen) {
      setDate(initialDate ?? "");
      const src = initialTime ?? "";
      if (src && presetTimeSlots.includes(src)) {
        setUseCustomTime(false);
        setPresetTime(src);
        setCustomStart("");
        setCustomEnd("");
      } else if (src && src.includes(" - ")) {
        const [start, end] = src.split(" - ");
        setUseCustomTime(true);
        setCustomStart(start ?? "");
        setCustomEnd(end ?? "");
        setPresetTime("");
      } else {
        setUseCustomTime(false);
        setPresetTime("");
        setCustomStart("");
        setCustomEnd("");
      }
      setTutorId(null);
      setMaxStudents(8);
    }
  }, [isOpen, initialDate, initialTime]);

  const { data: allTutors } = useSWR(
    isOpen ? "summer-active-tutors" : null,
    () => summerAPI.getActiveTutors()
  );

  const locationCode = LOCATION_TO_CODE[location] ?? location;
  const tutors = useMemo(
    () => allTutors?.filter((t) => t.default_location === locationCode) ?? [],
    [allTutors, locationCode]
  );

  const { refs, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
  });
  const dismiss = useDismiss(context, { outsidePressEvent: "mousedown" });
  const { getFloatingProps } = useInteractions([dismiss]);

  // Summer uses a single day-agnostic preset list, passed in from the parent.
  // Keep the dropdown selection in the list when the prop changes.
  useEffect(() => {
    if (useCustomTime) return;
    if (presetTime && !presetTimeSlots.includes(presetTime)) {
      setPresetTime(presetTimeSlots[0] ?? "");
    } else if (!presetTime && presetTimeSlots.length > 0) {
      setPresetTime(presetTimeSlots[0]);
    }
  }, [useCustomTime, presetTimeSlots, presetTime]);

  if (!isOpen) return null;

  const effectiveTime = useCustomTime
    ? `${customStart} - ${customEnd}`
    : presetTime;
  const isCustomValid =
    !useCustomTime ||
    (!!customStart && !!customEnd && customEnd > customStart);

  const canSubmit =
    !!date &&
    !!effectiveTime.trim() &&
    isCustomValid &&
    tutorId !== null &&
    maxStudents > 0 &&
    date >= courseStartDate &&
    date <= courseEndDate;

  const handleSubmit = async () => {
    if (!canSubmit || tutorId === null) return;
    setSubmitting(true);
    try {
      const resp = await summerAPI.createMakeupSlot({
        config_id: configId,
        location,
        date,
        time_slot: effectiveTime.trim(),
        tutor_id: tutorId,
        max_students: maxStudents,
      });
      showToast(
        resp.tutor_conflict_note
          ? `Make-up Slot created. ${resp.tutor_conflict_note}`
          : "Make-up Slot created.",
        resp.tutor_conflict_note ? "info" : "success"
      );
      onCreated();
      onClose();
    } catch (e: any) {
      showToast(e?.message || "Failed to create Make-up Slot", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FloatingPortal>
      <FloatingOverlay
        className="z-[10000] bg-black/50 flex items-center justify-center p-4"
        lockScroll
      >
        <FloatingFocusManager context={context}>
          <div
            ref={refs.setFloating}
            {...getFloatingProps()}
            className="w-full max-w-sm bg-card dark:bg-gray-900 rounded-lg shadow-xl border border-border"
          >
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <CalendarPlus className="h-5 w-5 text-amber-700 dark:text-amber-300" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">New Make-up Slot</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    One-off lesson on a specific date.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    min={courseStartDate}
                    max={courseEndDate}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Time</label>
                  {!useCustomTime ? (
                    <div className="space-y-1">
                      <div className="relative">
                        <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/40 pointer-events-none" />
                        <select
                          value={presetTime}
                          onChange={(e) => setPresetTime(e.target.value)}
                          className="w-full pl-8 pr-7 py-1.5 text-sm border border-border rounded-md bg-background appearance-none"
                        >
                          {presetTimeSlots.map((slot) => (
                            <option key={slot} value={slot}>{slot}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/40 pointer-events-none" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setUseCustomTime(true)}
                        className="text-[11px] text-primary hover:underline"
                      >
                        Use custom time
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={customStart}
                          onChange={(e) => setCustomStart(e.target.value)}
                          aria-label="Start time"
                          className={cn(
                            "flex-1 px-2 py-1.5 text-sm border rounded-md bg-background",
                            !isCustomValid && customStart && customEnd ? "border-red-400" : "border-border",
                          )}
                        />
                        <span className="text-foreground/50 text-xs">to</span>
                        <input
                          type="time"
                          value={customEnd}
                          onChange={(e) => setCustomEnd(e.target.value)}
                          aria-label="End time"
                          className={cn(
                            "flex-1 px-2 py-1.5 text-sm border rounded-md bg-background",
                            !isCustomValid && customStart && customEnd ? "border-red-400" : "border-border",
                          )}
                        />
                      </div>
                      {!isCustomValid && customStart && customEnd && (
                        <p className="text-[11px] text-red-500">End time must be after start time.</p>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setUseCustomTime(false);
                          setCustomStart("");
                          setCustomEnd("");
                        }}
                        className="text-[11px] text-primary hover:underline"
                      >
                        Use preset time slots
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Tutor</label>
                  <select
                    value={tutorId ?? ""}
                    onChange={(e) =>
                      setTutorId(e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background"
                  >
                    <option value="">— select tutor —</option>
                    {tutors.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.tutor_name}
                      </option>
                    ))}
                  </select>
                  {tutors.length === 0 && allTutors && (
                    <p className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground">
                      <AlertCircle className="h-3 w-3" />
                      No active tutors for this branch.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">
                    Max students
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={maxStudents}
                    onChange={(e) =>
                      setMaxStudents(parseInt(e.target.value, 10) || 1)
                    }
                    className="w-24 px-2 py-1.5 text-sm border border-border rounded-md bg-background"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={onClose}
                  disabled={submitting}
                  className="px-3 py-1.5 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitting}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
                    "bg-amber-600 text-white hover:bg-amber-600/90",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Create
                </button>
              </div>
            </div>
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  );
}
