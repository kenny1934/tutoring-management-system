"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/ToastContext";
import { extensionRequestsAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Calendar,
  Clock,
  User,
  Users,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  CalendarCheck,
  CalendarX,
  Info,
} from "lucide-react";
import type { ExtensionRequestDetail } from "@/types";

interface ExtensionRequestReviewModalProps {
  request: ExtensionRequestDetail;
  isOpen: boolean;
  onClose: () => void;
  onApproved?: () => void;
  onRejected?: () => void;
  adminTutorId: number;
}

export function ExtensionRequestReviewModal({
  request,
  isOpen,
  onClose,
  onApproved,
  onRejected,
  adminTutorId,
}: ExtensionRequestReviewModalProps) {
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<"review" | "approve" | "reject">("review");

  // Approval form state
  const [weeksToGrant, setWeeksToGrant] = useState(
    request.requested_extension_weeks
  );
  const [approvalNotes, setApprovalNotes] = useState("");
  const [rescheduleSession, setRescheduleSession] = useState(false);

  // Rejection form state
  const [rejectionReason, setRejectionReason] = useState("");

  const handleApprove = async () => {
    setIsSubmitting(true);

    try {
      await extensionRequestsAPI.approve(request.id, adminTutorId, {
        extension_granted_weeks: weeksToGrant,
        review_notes: approvalNotes || undefined,
        reschedule_session: rescheduleSession,
      });

      showToast("Extension request approved", "success");
      onApproved?.();
      onClose();
    } catch (error) {
      console.error("Failed to approve extension request:", error);
      showToast(
        error instanceof Error ? error.message : "Failed to approve",
        "error"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim() || rejectionReason.length < 5) {
      showToast("Please provide a rejection reason", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      await extensionRequestsAPI.reject(request.id, adminTutorId, {
        review_notes: rejectionReason.trim(),
      });

      showToast("Extension request rejected", "success");
      onRejected?.();
      onClose();
    } catch (error) {
      console.error("Failed to reject extension request:", error);
      showToast(
        error instanceof Error ? error.message : "Failed to reject",
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

  // Admin guidance styling
  const getGuidanceStyle = (guidance: string | undefined) => {
    if (!guidance) return "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300";
    if (guidance.startsWith("URGENT")) return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300";
    if (guidance.startsWith("REVIEW")) return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300";
    if (guidance.startsWith("QUESTION")) return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300";
    return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300";
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Review Extension Request"
      size="lg"
      footer={
        mode === "review" ? (
          <div className="flex justify-between w-full">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setMode("reject")}
                className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button onClick={() => setMode("approve")}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve
              </Button>
            </div>
          </div>
        ) : mode === "approve" ? (
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setMode("review")}
              disabled={isSubmitting}
            >
              Back
            </Button>
            <Button onClick={handleApprove} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Confirm Approval
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setMode("review")}
              disabled={isSubmitting}
            >
              Back
            </Button>
            <Button
              onClick={handleReject}
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Confirm Rejection
                </>
              )}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-5">
        {/* Admin Guidance Banner */}
        {request.admin_guidance && (
          <div
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
              getGuidanceStyle(request.admin_guidance)
            )}
          >
            <Info className="h-4 w-4 flex-shrink-0" />
            {request.admin_guidance}
          </div>
        )}

        {mode === "review" && (
          <>
            {/* Request Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Student
                </div>
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {request.student_name}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Requested By
                </div>
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {request.tutor_name}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(request.requested_at).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Session & Extension Details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                  <Calendar className="h-4 w-4" />
                  Original Session
                </div>
                <div className="text-blue-900 dark:text-blue-100">
                  {request.original_session_date}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                  <Clock className="h-4 w-4" />
                  Extension Requested
                </div>
                <div className="text-amber-900 dark:text-amber-100 text-xl font-bold">
                  {request.requested_extension_weeks} week
                  {request.requested_extension_weeks > 1 ? "s" : ""}
                </div>
              </div>
            </div>

            {/* Reason */}
            <div>
              <div className={labelClass}>Reason</div>
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-sm text-gray-700 dark:text-gray-300">
                {request.reason}
              </div>
            </div>

            {/* Enrollment Context */}
            <div className="space-y-3">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Enrollment Context
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
                  <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                    Current Extensions
                  </div>
                  <div className="font-bold text-gray-900 dark:text-gray-100">
                    {request.current_extension_weeks} weeks
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
                  <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                    Pending Makeups
                  </div>
                  <div className="font-bold text-gray-900 dark:text-gray-100">
                    {request.pending_makeups_count}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
                  <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                    Sessions Done
                  </div>
                  <div className="font-bold text-gray-900 dark:text-gray-100">
                    {request.sessions_completed}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
                  <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                    Lessons Paid
                  </div>
                  <div className="font-bold text-gray-900 dark:text-gray-100">
                    {request.enrollment_lessons_paid || "N/A"}
                  </div>
                </div>
              </div>

              {/* Deadline Display */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">
                    Current End Date
                  </span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {request.current_effective_end_date || "N/A"}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-between">
                  <span className="text-green-600 dark:text-green-400">
                    If Approved
                  </span>
                  <span className="font-medium text-green-700 dark:text-green-300">
                    {request.projected_effective_end_date || "N/A"}
                  </span>
                </div>
              </div>
            </div>

            {/* Proposed Reschedule */}
            {request.proposed_reschedule_date && (
              <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                <div className="flex items-center gap-2 text-sm font-medium text-purple-800 dark:text-purple-200 mb-1">
                  <CalendarCheck className="h-4 w-4" />
                  Proposed Reschedule
                </div>
                <div className="text-purple-900 dark:text-purple-100">
                  {request.proposed_reschedule_date}
                  {request.proposed_reschedule_time &&
                    ` at ${request.proposed_reschedule_time}`}
                </div>
              </div>
            )}
          </>
        )}

        {mode === "approve" && (
          <>
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="text-green-800 dark:text-green-200 font-medium mb-2">
                Approving Extension Request
              </div>
              <div className="text-sm text-green-700 dark:text-green-300">
                This will extend the enrollment deadline for {request.student_name}.
              </div>
            </div>

            <div>
              <label className={labelClass}>Weeks to Grant</label>
              <select
                value={weeksToGrant}
                onChange={(e) => setWeeksToGrant(Number(e.target.value))}
                className={inputClass}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} week{n > 1 ? "s" : ""}
                    {n === request.requested_extension_weeks && " (requested)"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Admin Notes (optional)</label>
              <textarea
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="Optional notes about this approval..."
                rows={2}
                className={cn(inputClass, "resize-none")}
              />
            </div>

            {request.proposed_reschedule_date && (
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="reschedule-session"
                  checked={rescheduleSession}
                  onChange={(e) => setRescheduleSession(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                <label
                  htmlFor="reschedule-session"
                  className="text-sm text-gray-700 dark:text-gray-300"
                >
                  Also reschedule session to {request.proposed_reschedule_date}
                  {request.proposed_reschedule_time &&
                    ` at ${request.proposed_reschedule_time}`}
                </label>
              </div>
            )}
          </>
        )}

        {mode === "reject" && (
          <>
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="text-red-800 dark:text-red-200 font-medium mb-2">
                Rejecting Extension Request
              </div>
              <div className="text-sm text-red-700 dark:text-red-300">
                The tutor will be notified that their request was denied.
              </div>
            </div>

            <div>
              <label className={labelClass}>
                Rejection Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Why is this request being rejected?"
                rows={3}
                className={cn(inputClass, "resize-none")}
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
