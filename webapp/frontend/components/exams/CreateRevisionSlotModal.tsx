"use client";

import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { toDateString, getDayName, isTimeRangeValid } from "@/lib/calendar-utils";
import { useTutors, useLocations } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { examRevisionAPI } from "@/lib/api";
import { useLocation } from "@/contexts/LocationContext";
import { WEEKDAY_TIME_SLOTS, WEEKEND_TIME_SLOTS, isWeekend } from "@/lib/constants";
import type { ExamWithRevisionSlots, SlotDefaults } from "@/types";
import {
  X,
  Loader2,
  Calendar,
  Clock,
  MapPin,
  User,
  FileText,
  AlertCircle,
} from "lucide-react";

interface CreateRevisionSlotModalProps {
  exam: ExamWithRevisionSlots;
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  currentTutorId: number;
  defaults?: SlotDefaults;
}

export function CreateRevisionSlotModal({
  exam,
  isOpen,
  onClose,
  onCreated,
  currentTutorId,
  defaults,
}: CreateRevisionSlotModalProps) {
  const { showToast } = useToast();
  const { data: tutors = [] } = useTutors();
  const { data: locations = [] } = useLocations();
  const { selectedLocation } = useLocation();

  // Form state - Default to 2 days before exam or today, whichever is later
  const [sessionDate, setSessionDate] = useState<string>(() => {
    const examDate = new Date(exam.start_date);
    const twoDaysBefore = new Date(examDate);
    twoDaysBefore.setDate(examDate.getDate() - 2);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return toDateString(twoDaysBefore < today ? today : twoDaysBefore);
  });

  // Time slot state
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customStartTime, setCustomStartTime] = useState("15:00");
  const [customEndTime, setCustomEndTime] = useState("16:30");

  // Get time slots based on selected date (weekday vs weekend)
  const timeSlotOptions = useMemo(() => {
    return isWeekend(sessionDate) ? WEEKEND_TIME_SLOTS : WEEKDAY_TIME_SLOTS;
  }, [sessionDate]);

  const [selectedPresetSlot, setSelectedPresetSlot] = useState<string>("");

  // Reset slot selection when date changes
  useEffect(() => {
    if (!useCustomTime && timeSlotOptions.length > 0) {
      setSelectedPresetSlot(timeSlotOptions[0]);
    }
  }, [timeSlotOptions, useCustomTime]);

  // Compute final time slot value
  const timeSlot = useMemo(() => {
    if (useCustomTime) {
      return `${customStartTime} - ${customEndTime}`;
    }
    return selectedPresetSlot || timeSlotOptions[0] || "";
  }, [useCustomTime, customStartTime, customEndTime, selectedPresetSlot, timeSlotOptions]);

  // Validate custom time (end time must be after start time)
  const isTimeValid = useMemo(() => {
    if (!useCustomTime) return true;
    return isTimeRangeValid(customStartTime, customEndTime);
  }, [useCustomTime, customStartTime, customEndTime]);

  const [tutorId, setTutorId] = useState<number>(defaults?.tutor_id ?? currentTutorId);
  const [location, setLocation] = useState<string>(
    defaults?.location ?? (selectedLocation !== "All Locations" ? selectedLocation : "")
  );
  const [notes, setNotes] = useState<string>(defaults?.notes ?? "");
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

  // Get available tutors for selection (filtered by modal's location dropdown)
  const availableTutors = useMemo(() => {
    let filtered = [...tutors];
    // Filter by the modal's location selection, not the sidebar
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await examRevisionAPI.createSlot({
        calendar_event_id: exam.id,
        session_date: sessionDate,
        time_slot: timeSlot,
        tutor_id: tutorId,
        location,
        notes: notes || undefined,
        created_by: currentUserEmail,
      });
      // Show warning if there are conflicts
      if (result.warning) {
        showToast(result.warning, "info");
      }
      onCreated(); // Parent will call mutate() to refresh data
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create revision slot");
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
              Create Revision Slot
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 truncate max-w-[300px]">
              {exam.title}
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
              aria-label="Session date"
              className="w-full px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a]"
              required
              aria-required="true"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Exam date: {new Date(exam.start_date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>

          {/* Time Slot */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <Clock className="h-4 w-4" />
                Time Slot
              </label>
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
            </div>

            {useCustomTime ? (
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
                value={selectedPresetSlot}
                onChange={(e) => setSelectedPresetSlot(e.target.value)}
                aria-label="Time slot"
                className="w-full px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a]"
                required
                aria-required="true"
              >
                {timeSlotOptions.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {isWeekend(sessionDate) ? "Weekend" : "Weekday"} slots shown
            </p>
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
              disabled={isLocationLocked}
              aria-label="Location"
              className={cn(
                "w-full px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a]",
                isLocationLocked && "bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
              )}
              required
              aria-required="true"
            >
              {isLocationLocked ? (
                <option value={selectedLocation}>{selectedLocation}</option>
              ) : (
                <>
                  <option value="">Select location...</option>
                  {locations
                    .filter((loc) => loc !== "Various" && loc !== "All Locations")
                    .map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                </>
              )}
            </select>
            {isLocationLocked && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Locked to sidebar location
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
                  Creating...
                </>
              ) : (
                "Create Slot"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
