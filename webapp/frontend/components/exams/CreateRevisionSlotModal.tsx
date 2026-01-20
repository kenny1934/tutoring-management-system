"use client";

import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { toDateString, getDayName } from "@/lib/calendar-utils";
import { useTutors } from "@/lib/hooks";
import { examRevisionAPI } from "@/lib/api";
import { addSlotToExamsCache } from "@/lib/exam-revision-cache";
import { useLocation } from "@/contexts/LocationContext";
import type { ExamWithRevisionSlots } from "@/types";
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
}

// Real time slots (matching ScheduleMakeupModal)
const WEEKDAY_TIME_SLOTS = ["16:45 - 18:15", "18:25 - 19:55"];
const WEEKEND_TIME_SLOTS = ["10:00 - 11:30", "11:45 - 13:15", "14:30 - 16:00", "16:15 - 17:45", "18:00 - 19:30"];

// Check if a date is weekend
const isWeekend = (dateStr: string) => {
  const day = new Date(dateStr).getDay();
  return day === 0 || day === 6;
};

export function CreateRevisionSlotModal({
  exam,
  isOpen,
  onClose,
  onCreated,
  currentTutorId,
}: CreateRevisionSlotModalProps) {
  const { data: tutors = [] } = useTutors();
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
    const [startH, startM] = customStartTime.split(':').map(Number);
    const [endH, endM] = customEndTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return endMinutes > startMinutes;
  }, [useCustomTime, customStartTime, customEndTime]);

  const [tutorId, setTutorId] = useState<number>(currentTutorId);
  const [location, setLocation] = useState<string>(
    selectedLocation !== "All Locations" ? selectedLocation : ""
  );
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get available tutors for selection (filtered by location)
  const availableTutors = useMemo(() => {
    let filtered = [...tutors];
    if (selectedLocation && selectedLocation !== "All Locations") {
      filtered = filtered.filter((t) => t.default_location === selectedLocation);
    }
    return filtered.sort((a, b) => a.tutor_name.localeCompare(b.tutor_name));
  }, [tutors, selectedLocation]);

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
      // Optimistically update the cache
      addSlotToExamsCache(exam.id, result);
      onCreated();
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
        "relative z-10 w-full max-w-lg min-w-[400px] mx-4 rounded-xl overflow-hidden",
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
              className="w-full px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a]"
              required
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
                    className={cn(
                      "flex-1 px-3 py-2 text-sm border rounded-lg bg-white dark:bg-[#1a1a1a]",
                      !isTimeValid ? "border-red-500" : "border-[#e8d4b8] dark:border-[#6b5a4a]"
                    )}
                    required
                  />
                  <span className="text-gray-400">–</span>
                  <input
                    type="time"
                    value={customEndTime}
                    onChange={(e) => setCustomEndTime(e.target.value)}
                    className={cn(
                      "flex-1 px-3 py-2 text-sm border rounded-lg bg-white dark:bg-[#1a1a1a]",
                      !isTimeValid ? "border-red-500" : "border-[#e8d4b8] dark:border-[#6b5a4a]"
                    )}
                    required
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
                className="w-full px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a]"
                required
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
              className="w-full px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a]"
              required
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
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a]"
              required
            />
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
