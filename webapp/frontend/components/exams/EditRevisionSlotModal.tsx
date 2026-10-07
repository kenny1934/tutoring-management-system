"use client";

import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { toDateString, isTimeRangeValid } from "@/lib/calendar-utils";
import { useActiveTutors, useLocations } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { examRevisionAPI } from "@/lib/api";
import { useLocation } from "@/contexts/LocationContext";
import { WEEKDAY_TIME_SLOTS, WEEKEND_TIME_SLOTS, isWeekend } from "@/lib/constants";
import type { ExamRevisionSlot } from "@/types";
import {
  X,
  Calendar,
  Clock,
  MapPin,
  User,
  FileText,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { worksAt } from "@/lib/employment";
import { TutorOptions } from "@/components/selectors/TutorOptions";
import { Button, IconButton, Label, Input, Select, Textarea } from "@/components/controls";

interface EditRevisionSlotModalProps {
  slot: ExamRevisionSlot;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  currentTutorId: number;
  readOnly?: boolean;
}

export function EditRevisionSlotModal({
  slot,
  isOpen,
  onClose,
  onUpdated,
  currentTutorId,
  readOnly = false,
}: EditRevisionSlotModalProps) {
  const { showToast } = useToast();
  const { data: tutors = [] } = useActiveTutors();
  const { data: locations = [] } = useLocations();
  const { selectedLocation } = useLocation();

  // Check if slot has enrolled students (restricts certain edits)
  const hasEnrolledStudents = slot.enrolled_count > 0;

  // Form state - initialized from slot
  const [sessionDate, setSessionDate] = useState<string>(slot.session_date);
  const [tutorId, setTutorId] = useState<number>(slot.tutor_id);
  const [location, setLocation] = useState<string>(slot.location);
  const [notes, setNotes] = useState<string>(slot.notes || "");

  // Time slot state - parse from existing slot
  const [useCustomTime, setUseCustomTime] = useState(() => {
    const presets = [...WEEKDAY_TIME_SLOTS, ...WEEKEND_TIME_SLOTS];
    return !presets.includes(slot.time_slot);
  });

  const [customStartTime, setCustomStartTime] = useState(() => {
    const parts = slot.time_slot.split(" - ");
    return parts[0] || "15:00";
  });
  const [customEndTime, setCustomEndTime] = useState(() => {
    const parts = slot.time_slot.split(" - ");
    return parts[1] || "16:30";
  });

  // Get time slots based on selected date
  const timeSlotOptions = useMemo(() => {
    return isWeekend(sessionDate) ? WEEKEND_TIME_SLOTS : WEEKDAY_TIME_SLOTS;
  }, [sessionDate]);

  const [selectedPresetSlot, setSelectedPresetSlot] = useState<string>(() => {
    if (timeSlotOptions.includes(slot.time_slot)) {
      return slot.time_slot;
    }
    return timeSlotOptions[0] || "";
  });

  // Reset preset slot when switching to presets or date changes
  useEffect(() => {
    if (!useCustomTime && timeSlotOptions.length > 0) {
      if (timeSlotOptions.includes(slot.time_slot)) {
        setSelectedPresetSlot(slot.time_slot);
      } else {
        setSelectedPresetSlot(timeSlotOptions[0]);
      }
    }
  }, [timeSlotOptions, useCustomTime, slot.time_slot]);

  // Compute final time slot value
  const timeSlot = useMemo(() => {
    if (useCustomTime) {
      return `${customStartTime} - ${customEndTime}`;
    }
    return selectedPresetSlot || timeSlotOptions[0] || "";
  }, [useCustomTime, customStartTime, customEndTime, selectedPresetSlot, timeSlotOptions]);

  // Validate custom time
  const isTimeValid = useMemo(() => {
    if (!useCustomTime) return true;
    return isTimeRangeValid(customStartTime, customEndTime);
  }, [useCustomTime, customStartTime, customEndTime]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  // Lock location dropdown when sidebar has specific location selected
  const isLocationLocked = selectedLocation && selectedLocation !== "All Locations";

  // Who can take this slot. A revision slot is a one-off booking on a known
  // date, the same shape as a make-up, so anybody covering that branch on that
  // date belongs here too. Re-asked when the date moves, since an arrangement
  // can be limited to particular days.
  const availableTutors = useMemo(() => {
    const filtered = tutors.filter((t) => worksAt(t, location, sessionDate));
    return filtered.sort((a, b) => a.tutor_name.localeCompare(b.tutor_name));
  }, [tutors, location, sessionDate]);

  // Get current user's email for audit trail
  const currentUserEmail = useMemo(() => {
    const tutor = tutors.find(t => t.id === currentTutorId);
    return tutor?.user_email;
  }, [tutors, currentTutorId]);

  // Check what fields have changed
  const hasDateTimeLocationChanges = useMemo(() => {
    return (
      sessionDate !== slot.session_date ||
      timeSlot !== slot.time_slot ||
      location !== slot.location
    );
  }, [sessionDate, timeSlot, location, slot]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const updateData: Record<string, unknown> = {};

      // Only include changed fields
      if (sessionDate !== slot.session_date) updateData.session_date = sessionDate;
      if (timeSlot !== slot.time_slot) updateData.time_slot = timeSlot;
      if (tutorId !== slot.tutor_id) updateData.tutor_id = tutorId;
      if (location !== slot.location) updateData.location = location;
      if (notes !== (slot.notes || "")) updateData.notes = notes || null;
      updateData.modified_by = currentUserEmail;

      const result = await examRevisionAPI.updateSlot(slot.id, updateData);
      // Show warning if there are tutor conflicts
      if (result.warning) {
        showToast(result.warning, "info");
      }
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update revision slot");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={cn(
        "relative z-10 w-[min(calc(100vw-2rem),28rem)] rounded-xl overflow-hidden",
        "bg-raised border border-line",
        "shadow-2xl paper-texture"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Edit Revision Slot
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              {new Date(slot.session_date + 'T00:00:00').toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })} • {slot.time_slot}
            </p>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Warning if enrolled students */}
          {hasEnrolledStudents && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-medium">{slot.enrolled_count} student(s) enrolled.</span>
                {" "}Date, time, and location cannot be changed. Remove enrollments first to edit those fields.
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Date */}
          <div>
            <Label htmlFor="edit-slot-date" className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              Session date
            </Label>
            <Input
              id="edit-slot-date"
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              min={toDateString(new Date())}
              disabled={hasEnrolledStudents}
              required
              aria-required="true"
            />
          </div>

          {/* Time Slot */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor={useCustomTime && !hasEnrolledStudents ? "edit-slot-start" : "edit-slot-time"} className="mb-0 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                Time slot
              </Label>
              {!hasEnrolledStudents && (
                <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomTime}
                    onChange={(e) => setUseCustomTime(e.target.checked)}
                    aria-label="Use custom time"
                    className="w-3.5 h-3.5 rounded border-gray-300 text-accent-ink focus:ring-primary"
                  />
                  Custom time
                </label>
              )}
            </div>

            {useCustomTime && !hasEnrolledStudents ? (
              <div>
                <div className="flex items-center gap-2">
                  <Input
                    id="edit-slot-start"
                    type="time"
                    value={customStartTime}
                    onChange={(e) => setCustomStartTime(e.target.value)}
                    aria-label="Start time"
                    aria-describedby={!isTimeValid ? "edit-slot-time-error" : undefined}
                    aria-invalid={!isTimeValid ? "true" : undefined}
                    className="flex-1"
                    required
                    aria-required="true"
                  />
                  <span className="text-gray-500" aria-hidden="true">–</span>
                  <Input
                    type="time"
                    value={customEndTime}
                    onChange={(e) => setCustomEndTime(e.target.value)}
                    aria-label="End time"
                    aria-describedby={!isTimeValid ? "edit-slot-time-error" : undefined}
                    aria-invalid={!isTimeValid ? "true" : undefined}
                    className="flex-1"
                    required
                    aria-required="true"
                  />
                </div>
                {!isTimeValid && (
                  <p id="edit-slot-time-error" className="mt-1 text-xs text-red-700 dark:text-red-400" role="alert">End time must be after start time</p>
                )}
              </div>
            ) : (
              <Select
                id="edit-slot-time"
                value={hasEnrolledStudents ? slot.time_slot : selectedPresetSlot}
                onChange={(e) => setSelectedPresetSlot(e.target.value)}
                disabled={hasEnrolledStudents}
                required
                aria-required="true"
              >
                {timeSlotOptions.map((slotOption) => (
                  <option key={slotOption} value={slotOption}>
                    {slotOption}
                  </option>
                ))}
                {!timeSlotOptions.includes(slot.time_slot) && (
                  <option value={slot.time_slot}>
                    {slot.time_slot} (current)
                  </option>
                )}
              </Select>
            )}
          </div>

          {/* Tutor */}
          <div>
            <Label htmlFor="edit-slot-tutor" className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" aria-hidden="true" />
              Tutor
            </Label>
            <Select
              id="edit-slot-tutor"
              value={tutorId}
              onChange={(e) => setTutorId(parseInt(e.target.value))}
              required
              aria-required="true"
            >
              <TutorOptions
                tutors={availableTutors}
                location={location}
                suffix={(tutor) => (tutor.id === currentTutorId ? " (you)" : "")}
              />
              {!availableTutors.find(t => t.id === slot.tutor_id) && (
                <option value={slot.tutor_id}>
                  {slot.tutor_name} (current)
                </option>
              )}
            </Select>
          </div>

          {/* Location */}
          <div>
            <Label htmlFor="edit-slot-location" className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              Location
            </Label>
            <Select
              id="edit-slot-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={hasEnrolledStudents || isLocationLocked}
              required
              aria-required="true"
            >
              {locations
                .filter((loc) => loc !== "Various" && loc !== "All Locations")
                .map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
            </Select>
            {hasEnrolledStudents && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Remove enrollments to change location
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="edit-slot-notes" className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              Notes <span className="normal-case font-normal">(optional)</span>
            </Label>
            <Textarea
              id="edit-slot-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional notes about this revision slot..."
              className="resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="quiet" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isSubmitting}
              disabled={readOnly || !isTimeValid}
              title={readOnly ? "Read-only access" : undefined}
            >
              {isSubmitting ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
