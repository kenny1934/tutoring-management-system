"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/ToastContext";
import { extensionRequestsAPI, enrollmentsAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getTimeSlotsForDay, ALL_TIME_SLOTS } from "@/lib/constants";
import { Calendar, Clock, AlertCircle, Send, Loader2, ChevronDown } from "lucide-react";
import type { Session, Enrollment } from "@/types";

interface ExtensionRequestModalProps {
  session: Session;
  /** Enrollment ID - if not provided, will use session.enrollment_id */
  enrollmentId?: number;
  /** Effective end date - if not provided, will be fetched from enrollment */
  effectiveEndDate?: string;
  isOpen: boolean;
  onClose: () => void;
  onRequestSubmitted?: () => void;
  tutorId: number;
  /** True when opened via direct button (not from deadline exceeded error) */
  isProactive?: boolean;
}

export function ExtensionRequestModal({
  session,
  enrollmentId: propEnrollmentId,
  effectiveEndDate: propEffectiveEndDate,
  isOpen,
  onClose,
  onRequestSubmitted,
  tutorId,
  isProactive = false,
}: ExtensionRequestModalProps) {
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [enrollmentId, setEnrollmentId] = useState<number | null>(propEnrollmentId ?? null);
  const [effectiveEndDate, setEffectiveEndDate] = useState<string>(propEffectiveEndDate ?? "");

  // State for student's active enrollments (for concurrent enrollment selection)
  const [studentEnrollments, setStudentEnrollments] = useState<Enrollment[]>([]);
  const [selectedTargetEnrollmentId, setSelectedTargetEnrollmentId] = useState<number | null>(null);

  // Filter for currently active Regular enrollments
  // Only shows dropdown for truly concurrent enrollments (e.g., twice-weekly students)
  const activeRegularEnrollments = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return studentEnrollments.filter(
      (e) => e.enrollment_type === "Regular" &&
             e.payment_status !== "Cancelled" &&
             (!e.effective_end_date || e.effective_end_date >= today)
    );
  }, [studentEnrollments]);

  // Show dropdown if multiple active Regular enrollments
  const showEnrollmentSelector = activeRegularEnrollments.length > 1;

  // Fetch enrollment data and student's enrollments
  useEffect(() => {
    if (isOpen && session.student_id) {
      setIsLoading(true);

      // Fetch both current enrollment and all student enrollments
      Promise.all([
        !propEffectiveEndDate && session.enrollment_id
          ? enrollmentsAPI.getById(session.enrollment_id)
          : Promise.resolve(null),
        enrollmentsAPI.getAll(session.student_id),
      ])
        .then(([sourceEnrollment, allEnrollments]) => {
          if (sourceEnrollment) {
            setEnrollmentId(sourceEnrollment.id);
            setEffectiveEndDate(sourceEnrollment.effective_end_date || "");
          }
          setStudentEnrollments(allEnrollments);

          // Auto-select if only one active Regular enrollment
          const activeRegular = allEnrollments.filter(
            (e) => e.enrollment_type === "Regular" && e.payment_status !== "Cancelled"
          );
          let selectedTargetId: number | null = null;
          if (activeRegular.length === 1) {
            selectedTargetId = activeRegular[0].id;
            setSelectedTargetEnrollmentId(selectedTargetId);
          } else if (activeRegular.length > 1) {
            // Default to the latest enrollment (first one, since sorted by first_lesson_date desc)
            const latest = [...activeRegular].sort(
              (a, b) => new Date(b.first_lesson_date || 0).getTime() - new Date(a.first_lesson_date || 0).getTime()
            )[0];
            selectedTargetId = latest.id;
            setSelectedTargetEnrollmentId(selectedTargetId);
          }

          // Also set effectiveEndDate from target enrollment if not already set from source/prop
          // This ensures projectedDeadline can be calculated for date validation warning
          if (!propEffectiveEndDate && !sourceEnrollment && selectedTargetId) {
            const target = activeRegular.find((e) => e.id === selectedTargetId);
            if (target?.effective_end_date) {
              setEffectiveEndDate(target.effective_end_date);
            }
          }
        })
        .catch((error) => {
          console.error("Failed to fetch enrollment data:", error);
          showToast("Failed to load enrollment data", "error");
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, propEffectiveEndDate, session.enrollment_id, session.student_id, showToast]);

  // Form state - extension is always +1 week for single lesson
  const [reason, setReason] = useState("");
  const [proposedDate, setProposedDate] = useState("");
  const [proposedTime, setProposedTime] = useState("");

  // Custom time state
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customTimeStart, setCustomTimeStart] = useState("");
  const [customTimeEnd, setCustomTimeEnd] = useState("");

  // Compute available time slots based on selected date
  const availableTimeSlots = useMemo(() => {
    if (!proposedDate) return [...ALL_TIME_SLOTS];
    const dayIndex = new Date(proposedDate + "T00:00:00Z").getUTCDay();
    return [...getTimeSlotsForDay(dayIndex)];
  }, [proposedDate]);

  // Compute effective time for submission
  const effectiveProposedTime = useCustomTime
    ? (customTimeStart && customTimeEnd ? `${customTimeStart} - ${customTimeEnd}` : "")
    : proposedTime;

  // Calculate projected deadline (current end date + 1 week extension)
  const projectedDeadline = useMemo(() => {
    // Get effective end date from selected target enrollment if available
    const targetEnrollment = selectedTargetEnrollmentId
      ? activeRegularEnrollments.find((e) => e.id === selectedTargetEnrollmentId)
      : null;
    const baseDate = targetEnrollment?.effective_end_date || effectiveEndDate;

    if (!baseDate) return null;

    const date = new Date(baseDate + "T00:00:00Z");  // Parse as UTC
    date.setUTCDate(date.getUTCDate() + 7); // Add 1 week in UTC
    return date.toISOString().split("T")[0];
  }, [selectedTargetEnrollmentId, activeRegularEnrollments, effectiveEndDate]);

  // Check if proposed date exceeds the projected deadline
  const proposedDateExceedsDeadline = useMemo(() => {
    if (!proposedDate || !projectedDeadline) return false;
    return proposedDate > projectedDeadline;
  }, [proposedDate, projectedDeadline]);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      showToast("Please provide a reason", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      await extensionRequestsAPI.create(
        {
          session_id: session.id,
          requested_extension_weeks: 1, // Always +1 week for single lesson extension
          reason: reason.trim(),
          proposed_reschedule_date: proposedDate || undefined,
          proposed_reschedule_time: effectiveProposedTime || undefined,
          target_enrollment_id: selectedTargetEnrollmentId || undefined,
        },
        tutorId
      );

      showToast("Extension request submitted successfully", "success");
      onRequestSubmitted?.();
      onClose();

      // Reset form
      setReason("");
      setProposedDate("");
      setProposedTime("");
      setUseCustomTime(false);
      setCustomTimeStart("");
      setCustomTimeEnd("");
    } catch (error) {
      console.error("Failed to submit extension request:", error);
      showToast(
        error instanceof Error ? error.message : "Failed to submit request",
        "error"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = cn(
    "w-full px-3 py-2 rounded-md border",
    "bg-white dark:bg-gray-900",
    "border-gray-300 dark:border-gray-600",
    "text-gray-900 dark:text-gray-100",
    "focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent",
    "text-sm"
  );

  const labelClass =
    "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Request Deadline Extension"
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting || isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || isLoading || !enrollmentId}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit Request
              </>
            )}
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-5 animate-pulse">
          {/* Loading skeleton */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-gray-100 dark:bg-gray-800">
            <div className="h-5 w-5 rounded bg-gray-300 dark:bg-gray-600" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-gray-300 dark:bg-gray-600" />
              <div className="h-3 w-full rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
          <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800">
            <div className="h-3 w-20 rounded bg-gray-300 dark:bg-gray-600 mb-2" />
            <div className="h-4 w-32 rounded bg-gray-300 dark:bg-gray-600 mb-2" />
            <div className="h-3 w-40 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-28 rounded bg-gray-300 dark:bg-gray-600" />
            <div className="h-20 w-full rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      ) : (
      <div className="space-y-5">
        {/* Info Banner */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-200">
              {isProactive ? "Request Deadline Extension" : "Enrollment deadline exceeded"}
            </p>
            <p className="text-amber-700 dark:text-amber-300 mt-1">
              {isProactive ? (
                <>
                  The enrollment ends on{" "}
                  <span className="font-semibold">{effectiveEndDate || "Loading..."}</span>. Request a
                  +1 week extension to schedule this pending makeup session at the
                  student&apos;s regular time slot past the deadline.
                </>
              ) : (
                <>
                  The current enrollment ends on{" "}
                  <span className="font-semibold">{effectiveEndDate || "Loading..."}</span>. To
                  schedule this makeup at the regular time slot past the deadline,
                  you need a +1 week extension approved by an admin.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Session Info */}
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Session #{session.id}
          </div>
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {session.student_name}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {session.session_date}
            {session.time_slot && (
              <>
                <Clock className="h-4 w-4 ml-2" />
                {session.time_slot}
              </>
            )}
          </div>
        </div>

        {/* Enrollment Selector - only shown when student has multiple concurrent enrollments */}
        {showEnrollmentSelector && (
          <div>
            <label className={labelClass}>
              Enrollment to Extend <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              This student has multiple active enrollments. Select which one to extend.
            </p>
            <div className="relative">
              <select
                value={selectedTargetEnrollmentId || ""}
                onChange={(e) => setSelectedTargetEnrollmentId(Number(e.target.value))}
                className={cn(inputClass, "appearance-none pr-8")}
              >
                {activeRegularEnrollments.map((enrollment) => (
                  <option key={enrollment.id} value={enrollment.id}>
                    {enrollment.assigned_day || "Unscheduled"} {enrollment.assigned_time || ""} -
                    #{enrollment.id} (Ends: {enrollment.effective_end_date || "N/A"})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Reason */}
        <div>
          <label className={labelClass}>
            Reason for Extension <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is an extension needed? (e.g., student has pending makeups, scheduling conflicts, etc.)"
            rows={3}
            className={cn(inputClass, "resize-none")}
          />
        </div>

        {/* Proposed Reschedule (Optional) */}
        <div className="space-y-3">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Proposed Reschedule Date{" "}
            <span className="text-gray-400">(optional)</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">
                Date
              </label>
              <input
                type="date"
                value={proposedDate}
                onChange={(e) => setProposedDate(e.target.value)}
                aria-describedby={proposedDateExceedsDeadline ? "extension-date-warning" : undefined}
                aria-invalid={proposedDateExceedsDeadline ? "true" : undefined}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">
                Time Slot
              </label>
              {!useCustomTime ? (
                <div className="space-y-1.5">
                  <div className="relative">
                    <select
                      value={proposedTime}
                      onChange={(e) => setProposedTime(e.target.value)}
                      className={cn(inputClass, "appearance-none pr-8")}
                    >
                      <option value="">Select time slot</option>
                      {availableTimeSlots.map((slot) => (
                        <option key={slot} value={slot}>{slot}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setUseCustomTime(true)}
                    className="text-xs text-[#a0704b] hover:underline"
                  >
                    Use custom time
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={customTimeStart}
                      onChange={(e) => setCustomTimeStart(e.target.value)}
                      className={cn(inputClass, "flex-1")}
                    />
                    <span className="text-gray-500 text-sm">to</span>
                    <input
                      type="time"
                      value={customTimeEnd}
                      onChange={(e) => setCustomTimeEnd(e.target.value)}
                      className={cn(inputClass, "flex-1")}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUseCustomTime(false);
                      setCustomTimeStart("");
                      setCustomTimeEnd("");
                    }}
                    className="text-xs text-[#a0704b] hover:underline"
                  >
                    Use preset times
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* Warning if proposed date exceeds projected deadline */}
          {proposedDateExceedsDeadline && (
            <div id="extension-date-warning" role="alert" className="flex items-start gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                This date is after the projected deadline ({projectedDeadline}). The
                makeup may still exceed the enrollment deadline even with the extension.
              </p>
            </div>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            If approved, the admin can optionally reschedule the session to this
            date/time.
          </p>
        </div>
      </div>
      )}
    </Modal>
  );
}
