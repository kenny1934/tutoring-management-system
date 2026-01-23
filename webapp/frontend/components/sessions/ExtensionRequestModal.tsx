"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/ToastContext";
import { extensionRequestsAPI, enrollmentsAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Calendar, Clock, AlertCircle, Send, Loader2 } from "lucide-react";
import type { Session } from "@/types";

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

  // Fetch enrollment data if not provided
  useEffect(() => {
    if (isOpen && !propEffectiveEndDate && session.enrollment_id) {
      setIsLoading(true);
      enrollmentsAPI.getById(session.enrollment_id)
        .then((enrollment) => {
          setEnrollmentId(enrollment.id);
          setEffectiveEndDate(enrollment.effective_end_date || "");
        })
        .catch((error) => {
          console.error("Failed to fetch enrollment data:", error);
          showToast("Failed to load enrollment data", "error");
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, propEffectiveEndDate, session.enrollment_id, showToast]);

  // Form state - extension is always +1 week for single lesson
  const [reason, setReason] = useState("");
  const [proposedDate, setProposedDate] = useState("");
  const [proposedTime, setProposedTime] = useState("");

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
          proposed_reschedule_time: proposedTime || undefined,
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
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">
                Time Slot
              </label>
              <input
                type="text"
                value={proposedTime}
                onChange={(e) => setProposedTime(e.target.value)}
                placeholder="e.g., 16:45 - 18:15"
                className={inputClass}
              />
            </div>
          </div>
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
