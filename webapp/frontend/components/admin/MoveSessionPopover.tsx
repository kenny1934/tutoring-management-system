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
import useSWR from "swr";
import { Loader2, AlertCircle, ArrowRightLeft, AlertTriangle, Clock, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { summerAPI } from "@/lib/api";
import { LOCATION_TO_CODE, formatShortDate } from "@/lib/summer-utils";

type MovePreview = {
  action: "reused_slot" | "created_adhoc";
  grade_warning?: string | null;
  tutor_conflict_note?: string | null;
};

interface MoveSessionPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  /** Issues a Move call. The popover passes `force_create_adhoc` when the
   *  admin opts to skip an existing grade-mismatch slot. The popover handles
   *  preview itself, so callers only need to handle the final execute step. */
  onExecute: (payload: {
    target_date: string;
    time_slot: string;
    tutor_id: number;
    force_create_adhoc?: boolean;
  }) => Promise<void>;
  /** Async preview call — same payload shape, dry_run=true under the hood. */
  onPreview: (payload: {
    target_date: string;
    time_slot: string;
    tutor_id: number;
    force_create_adhoc?: boolean;
  }) => Promise<MovePreview>;
  /** Current session context — used for sensible defaults. */
  source: {
    lessonNumber: number | null;
    lessonDate: string | null;
    timeSlot: string | null;
    location: string | null;
    tutorName: string | null;
  };
  courseStartDate: string;
  courseEndDate: string;
  /** Preset time-slot dropdown options. Summer uses a single day-agnostic list
   *  (see `getSummerTimeSlots`) rather than weekday/weekend splits. */
  presetTimeSlots: readonly string[];
}

type Step = "form" | "confirm";

export function MoveSessionPopover({
  isOpen,
  onClose,
  onExecute,
  onPreview,
  source,
  courseStartDate,
  courseEndDate,
  presetTimeSlots,
}: MoveSessionPopoverProps) {
  const [date, setDate] = useState("");
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [presetTime, setPresetTime] = useState<string>("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [tutorId, setTutorId] = useState<number | null>(null);
  const [step, setStep] = useState<Step>("form");
  const [preview, setPreview] = useState<MovePreview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDate(source.lessonDate ?? "");
      // Seed the preset/custom inputs from the source time slot. If the source
      // matches a known preset we use that; otherwise fall back to custom mode.
      const src = source.timeSlot ?? "";
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
      setStep("form");
      setPreview(null);
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen, source.lessonDate, source.timeSlot, presetTimeSlots]);

  const { data: allTutors } = useSWR(
    isOpen ? "summer-active-tutors" : null,
    () => summerAPI.getActiveTutors(),
  );

  const locationCode = source.location
    ? LOCATION_TO_CODE[source.location] ?? source.location
    : null;
  const tutors = useMemo(
    () => (locationCode
      ? allTutors?.filter((t) => t.default_location === locationCode) ?? []
      : allTutors ?? []),
    [allTutors, locationCode],
  );

  // Summer uses a single day-agnostic list — no weekday/weekend split. The
  // list comes from the location's config and is passed in via props.
  useEffect(() => {
    if (useCustomTime) return;
    if (presetTime && !presetTimeSlots.includes(presetTime)) {
      setPresetTime(presetTimeSlots[0] ?? "");
    } else if (!presetTime && presetTimeSlots.length > 0) {
      setPresetTime(presetTimeSlots[0]);
    }
  }, [useCustomTime, presetTimeSlots, presetTime]);

  const { refs, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open && !submitting) onClose();
    },
  });
  const dismiss = useDismiss(context, { outsidePressEvent: "mousedown" });
  const { getFloatingProps } = useInteractions([dismiss]);

  if (!isOpen) return null;

  const effectiveTimeSlot = useCustomTime
    ? `${customStart} - ${customEnd}`
    : presetTime;
  const isCustomValid =
    !useCustomTime ||
    (!!customStart && !!customEnd && customEnd > customStart);
  const dateValid =
    !!date && date >= courseStartDate && date <= courseEndDate;
  const canSubmit =
    dateValid && !!effectiveTimeSlot.trim() && isCustomValid && tutorId !== null && !submitting;

  const payload = () => ({
    target_date: date,
    time_slot: effectiveTimeSlot.trim(),
    tutor_id: tutorId!,
  });

  const runPreview = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const p = await onPreview(payload());
      // Clean reuse with no warnings → execute straight away.
      if (p.action === "reused_slot" && !p.grade_warning) {
        await onExecute(payload());
        onClose();
        return;
      }
      setPreview(p);
      setStep("confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Move preview failed");
    } finally {
      setSubmitting(false);
    }
  };

  const runExecute = async (forceCreateAdhoc: boolean) => {
    setSubmitting(true);
    setError(null);
    try {
      await onExecute({ ...payload(), force_create_adhoc: forceCreateAdhoc });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Move failed");
    } finally {
      setSubmitting(false);
    }
  };

  const renderForm = () => (
    <div className="p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30">
          <ArrowRightLeft className="h-5 w-5 text-blue-700 dark:text-blue-300" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">
            Move {source.lessonNumber != null ? `L${source.lessonNumber}` : "lesson"}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pick a new date, time and tutor. We&rsquo;ll reuse an existing slot when possible.
          </p>
          {(source.lessonDate || source.timeSlot || source.tutorName) && (
            <p className="text-[11px] text-muted-foreground mt-1">
              From: {[source.lessonDate, source.timeSlot, source.tutorName].filter(Boolean).join(" · ")}
            </p>
          )}
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
              <option key={t.id} value={t.id}>{t.tutor_name}</option>
            ))}
          </select>
          {tutors.length === 0 && allTutors && (
            <p className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground">
              <AlertCircle className="h-3 w-3" />
              No active tutors for this branch.
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-1.5 text-[11px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-2 py-1.5">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onClose}
          disabled={submitting}
          className="px-3 py-1.5 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={runPreview}
          disabled={!canSubmit}
          className={cn(
            "inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
            "bg-blue-600 text-white hover:bg-blue-600/90",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Move
        </button>
      </div>
    </div>
  );

  const renderConfirm = () => {
    if (!preview) return null;
    const isAdhoc = preview.action === "created_adhoc";
    const tutorName = tutors.find((t) => t.id === tutorId)?.tutor_name ?? "this tutor";
    const friendlyDate = date ? formatShortDate(date) : date;
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30">
            <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">
              {isAdhoc ? "Create a new Make-up Slot?" : "Grade mismatch, proceed?"}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {isAdhoc
                ? `${tutorName} doesn’t have a class at ${friendlyDate}, ${effectiveTimeSlot} in this branch yet. A new Make-up Slot will be created with ${tutorName} as the tutor and this student placed into it.`
                : preview.grade_warning}
            </p>
            {preview.tutor_conflict_note && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-2">
                {preview.tutor_conflict_note}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-1.5 text-[11px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-2 py-1.5">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            onClick={() => {
              setStep("form");
              setPreview(null);
              setError(null);
            }}
            disabled={submitting}
            className="px-3 py-1.5 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Back
          </button>
          {/* Grade mismatch only: offer to skip the existing slot and create
              a dedicated Make-up Slot instead. Hidden on create-Make-up previews. */}
          {!isAdhoc && (
            <button
              onClick={() => runExecute(true)}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50"
            >
              Create separate Make-up Slot
            </button>
          )}
          <button
            onClick={() => runExecute(false)}
            disabled={submitting}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
              "bg-amber-600 text-white hover:bg-amber-600/90",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isAdhoc ? "Create Make-up Slot and move" : "Place anyway"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <FloatingPortal>
      <FloatingOverlay
        className="z-[10001] bg-black/50 flex items-center justify-center p-4"
        lockScroll
      >
        <FloatingFocusManager context={context}>
          <div
            ref={refs.setFloating}
            {...getFloatingProps()}
            className="w-full max-w-sm bg-card dark:bg-gray-900 rounded-lg shadow-xl border border-border"
          >
            {step === "form" ? renderForm() : renderConfirm()}
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  );
}
