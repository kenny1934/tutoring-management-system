"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/ToastContext";
import { extensionRequestsAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Calendar, Clock, AlertCircle, Send, Loader2 } from "lucide-react";
import type { Session } from "@/types";

interface ExtensionRequestModalProps {
  session: Session;
  enrollmentId: number;
  effectiveEndDate: string;
  isOpen: boolean;
  onClose: () => void;
  onRequestSubmitted?: () => void;
  tutorId: number;
}

export function ExtensionRequestModal({
  session,
  enrollmentId,
  effectiveEndDate,
  isOpen,
  onClose,
  onRequestSubmitted,
  tutorId,
}: ExtensionRequestModalProps) {
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [weeksRequested, setWeeksRequested] = useState(2);
  const [reason, setReason] = useState("");
  const [proposedDate, setProposedDate] = useState("");
  const [proposedTime, setProposedTime] = useState("");

  const handleSubmit = async () => {
    if (!reason.trim() || reason.length < 10) {
      showToast("Please provide a reason (at least 10 characters)", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      await extensionRequestsAPI.create(
        {
          session_id: session.id,
          requested_extension_weeks: weeksRequested,
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
      setWeeksRequested(2);
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
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
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
      <div className="space-y-5">
        {/* Info Banner */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-200">
              Enrollment deadline exceeded
            </p>
            <p className="text-amber-700 dark:text-amber-300 mt-1">
              The current enrollment ends on{" "}
              <span className="font-semibold">{effectiveEndDate}</span>. To
              schedule a makeup session past this date, you need an extension
              approved by an admin.
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

        {/* Weeks Requested */}
        <div>
          <label className={labelClass}>Extension Duration</label>
          <select
            value={weeksRequested}
            onChange={(e) => setWeeksRequested(Number(e.target.value))}
            className={inputClass}
          >
            <option value={1}>1 week</option>
            <option value={2}>2 weeks (standard)</option>
            <option value={3}>3 weeks</option>
            <option value={4}>4 weeks</option>
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Standard extensions are 1-2 weeks. Longer extensions may require
            additional review.
          </p>
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
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {reason.length}/10 characters minimum
          </p>
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
    </Modal>
  );
}
