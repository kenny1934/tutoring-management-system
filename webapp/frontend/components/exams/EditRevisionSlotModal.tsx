"use client";

import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { toDateString, isTimeRangeValid } from "@/lib/calendar-utils";
import { useTutors, useLocations } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { examRevisionAPI } from "@/lib/api";
import { useLocation } from "@/contexts/LocationContext";
import { WEEKDAY_TIME_SLOTS, WEEKEND_TIME_SLOTS, isWeekend } from "@/lib/constants";
import type { ExamRevisionSlot } from "@/types";
import {
  X,
  Loader2,
  Calendar,
  Clock,
  MapPin,
  User,
  FileText,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";

interface EditRevisionSlotModalProps {
  slot: ExamRevisionSlot;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  currentTutorId: number;
}

export function EditRevisionSlotModal({
  slot,
  isOpen,
  onClose,
  onUpdated,
  currentTutorId,
}: EditRevisionSlotModalProps) {
  const { showToast } = useToast();
  const { data: tutors = [] } = useTutors();
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

  // Get available tutors for selection
  const availableTutors = useMemo(() => {
    let filtered = [...tutors];
    if (location) {
      filtered = filtered.filter((t) => t.default_location === location);
    }
    return filtered.sort((a, b) => a.tutor_name.localeCompare(b.tutor_name));
  }, [tutors, location]);

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
        "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a]",
        "shadow-2xl paper-texture"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Edit Revision Slot
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              {new Date(slot.session_date + 'T00:00:00').toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} • {slot.time_slot}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
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
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <Calendar className="h-4 w-4" />
              Session Date
            </label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              min={toDateString(new Date())}
              disabled={hasEnrolledStudents}
              aria-label="Session date"
              className={cn(
                "w-full px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a]",
                hasEnrolledStudents && "bg-gray-100 dark:bg-gray-800 cursor-not-allowed opacity-60"
              )}
              required
              aria-required="true"
            />
          </div>

          {/* Time Slot */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <Clock className="h-4 w-4" />
                Time Slot
              </label>
              {!hasEnrolledStudents && (
                <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomTime}
                    onChange={(e) => setUseCustomTime(e.target.checked)}
                    aria-label="Use custom time"
                    className="w-3.5 h-3.5 rounded border-gray-300 text-[#a0704b] focus:ring-[#a0704b]"
                  />
                  Custom time
                </label>
              )}
            </div>

            {useCustomTime && !hasEnrolledStudents ? (
              <div>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={customStartTime}
                    onChange={(e) => setCustomStartTime(e.target.value)}
                    aria-label="Start time"
                    className={cn(
                      "flex-1 px-3 py-2 text-sm border rounded-lg bg-white dark:bg-[#1a1a1a]",
                      !isTimeValid ? "border-red-500" : "border-[#e8d4b8] dark:border-[#6b5a4a]"
                    )}
                    required
                    aria-required="true"
                  />
                  <span className="text-gray-400">–</span>
                  <input
                    type="time"
                    value={customEndTime}
                    onChange={(e) => setCustomEndTime(e.target.value)}
                    aria-label="End time"
                    className={cn(
                      "flex-1 px-3 py-2 text-sm border rounded-lg bg-white dark:bg-[#1a1a1a]",
                      !isTimeValid ? "border-red-500" : "border-[#e8d4b8] dark:border-[#6b5a4a]"
                    )}
                    required
                    aria-required="true"
                  />
                </div>
                {!isTimeValid && (
                  <p className="mt-1 text-xs text-red-500">End time must be after start time</p>
                )}
              </div>
            ) : (
              <select
                value={hasEnrolledStudents ? slot.time_slot : selectedPresetSlot}
                onChange={(e) => setSelectedPresetSlot(e.target.value)}
                disabled={hasEnrolledStudents}
                aria-label="Time slot"
                className={cn(
                  "w-full px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a]",
                  hasEnrolledStudents && "bg-gray-100 dark:bg-gray-800 cursor-not-allowed opacity-60"
                )}
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
              </select>
            )}
          </div>

          {/* Tutor */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <User className="h-4 w-4" />
              Tutor
            </label>
            <select
              value={tutorId}
              onChange={(e) => setTutorId(parseInt(e.target.value))}
              aria-label="Tutor"
              className="w-full px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a]"
              required
              aria-required="true"
            >
              {availableTutors.map((tutor) => (
                <option key={tutor.id} value={tutor.id}>
                  {tutor.tutor_name}
                  {tutor.id === currentTutorId ? " (you)" : ""}
                </option>
              ))}
              {!availableTutors.find(t => t.id === slot.tutor_id) && (
                <option value={slot.tutor_id}>
                  {slot.tutor_name} (current)
                </option>
              )}
            </select>
          </div>

          {/* Location */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <MapPin className="h-4 w-4" />
              Location
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={hasEnrolledStudents || isLocationLocked}
              aria-label="Location"
              className={cn(
                "w-full px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a]",
                (hasEnrolledStudents || isLocationLocked) && "bg-gray-100 dark:bg-gray-800 cursor-not-allowed opacity-60"
              )}
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
            </select>
            {hasEnrolledStudents && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Remove enrollments to change location
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <FileText className="h-4 w-4" />
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional notes about this revision slot..."
              aria-label="Notes"
              className="w-full px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a] resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isTimeValid}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                "bg-[#a0704b] hover:bg-[#8a5f3e] text-white",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
