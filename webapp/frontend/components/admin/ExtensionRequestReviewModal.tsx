"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/ToastContext";
import { extensionRequestsAPI, sessionsAPI, enrollmentsAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  CalendarCheck,
  Info,
  CalendarPlus,
  ExternalLink,
} from "lucide-react";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { ScheduleMakeupModal } from "@/components/sessions/ScheduleMakeupModal";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { EnrollmentDetailPopover } from "@/components/enrollments/EnrollmentDetailPopover";
import type { ExtensionRequestDetail, Session, Enrollment } from "@/types";

interface ExtensionRequestReviewModalProps {
  request: ExtensionRequestDetail & { _isLoading?: boolean };
  isOpen: boolean;
  onClose: () => void;
  onApproved?: () => void;
  onRejected?: () => void;
  adminTutorId: number;
  readOnly?: boolean;  // When true, hides approve/reject buttons (view-only mode for non-admins)
  showLocationPrefix?: boolean;  // Show location prefix on student names
}

export function ExtensionRequestReviewModal({
  request,
  isOpen,
  onClose,
  onApproved,
  onRejected,
  adminTutorId,
  readOnly = false,
  showLocationPrefix = false,
}: ExtensionRequestReviewModalProps) {
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Determine initial mode based on request status
  const getInitialMode = (): "review" | "approve" | "reject" | "approved" | "rejected" => {
    if (request.request_status === "Approved") return "approved";
    if (request.request_status === "Rejected") return "rejected";
    return "review";
  };

  const [mode, setMode] = useState<"review" | "approve" | "reject" | "approved" | "rejected">(getInitialMode);

  // Approval form state
  const [weeksToGrant, setWeeksToGrant] = useState(
    request.requested_extension_weeks
  );
  const [approvalNotes, setApprovalNotes] = useState("");

  // Rejection form state
  const [rejectionReason, setRejectionReason] = useState("");

  // Post-approval makeup scheduling state
  const [sessionForMakeup, setSessionForMakeup] = useState<Session | null>(null);
  const [showMakeupModal, setShowMakeupModal] = useState(false);
  const [isFetchingSession, setIsFetchingSession] = useState(false);

  // Session popover state
  const [showSessionPopover, setShowSessionPopover] = useState(false);
  const [sessionClickPos, setSessionClickPos] = useState<{ x: number; y: number } | null>(null);

  // Enrollment popover state
  const [sourceEnrollment, setSourceEnrollment] = useState<Enrollment | null>(null);
  const [targetEnrollment, setTargetEnrollment] = useState<Enrollment | null>(null);
  const [showEnrollmentPopover, setShowEnrollmentPopover] = useState<'source' | 'target' | null>(null);
  const [enrollmentClickPos, setEnrollmentClickPos] = useState<{ x: number; y: number } | null>(null);
  const [isFetchingEnrollment, setIsFetchingEnrollment] = useState(false);

  // Reset mode when request changes (e.g., opening different request)
  React.useEffect(() => {
    setMode(getInitialMode());
    setSessionForMakeup(null);
    setWeeksToGrant(request.requested_extension_weeks);
  }, [request.id, request.request_status]);

  // Pre-fetch session for approved requests to show rescheduled info
  React.useEffect(() => {
    if (isOpen && request.request_status === "Approved" && !sessionForMakeup) {
      sessionsAPI.getById(request.session_id).then(setSessionForMakeup).catch(console.error);
    }
  }, [isOpen, request.session_id, request.request_status]);

  // Reset enrollment state when request changes
  React.useEffect(() => {
    setSourceEnrollment(null);
    setTargetEnrollment(null);
    setShowEnrollmentPopover(null);
    setShowSessionPopover(false);
  }, [request.id]);

  const handleSessionClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSessionClickPos({ x: e.clientX, y: e.clientY });
    if (!sessionForMakeup) {
      setIsFetchingSession(true);
      try {
        const session = await sessionsAPI.getById(request.session_id);
        setSessionForMakeup(session);
      } catch (error) {
        console.error("Failed to fetch session:", error);
      } finally {
        setIsFetchingSession(false);
      }
    }
    setShowSessionPopover(true);
  };

  const handleEnrollmentClick = async (e: React.MouseEvent, type: 'source' | 'target') => {
    e.stopPropagation();
    setEnrollmentClickPos({ x: e.clientX, y: e.clientY });
    const enrollmentId = type === 'source' ? request.enrollment_id : (request.target_enrollment_id || request.enrollment_id);

    // Check if already fetched
    const cached = type === 'source' ? sourceEnrollment : targetEnrollment;
    if (!cached || cached.id !== enrollmentId) {
      setIsFetchingEnrollment(true);
      try {
        const enrollment = await enrollmentsAPI.getById(enrollmentId);
        if (type === 'source') setSourceEnrollment(enrollment);
        else setTargetEnrollment(enrollment);
      } catch (error) {
        console.error("Failed to fetch enrollment:", error);
      } finally {
        setIsFetchingEnrollment(false);
      }
    }
    setShowEnrollmentPopover(type);
  };

  const handleApprove = async () => {
    setIsSubmitting(true);

    try {
      await extensionRequestsAPI.approve(request.id, adminTutorId, {
        extension_granted_weeks: weeksToGrant,
        review_notes: approvalNotes || undefined,
      });

      showToast("Extension request approved", "success");
      setMode("approved");
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

  const handleScheduleMakeup = async () => {
    setIsFetchingSession(true);
    try {
      const session = await sessionsAPI.getById(request.session_id);
      setSessionForMakeup(session);
      setShowMakeupModal(true);
    } catch (error) {
      console.error("Failed to fetch session:", error);
      showToast("Failed to load session for scheduling", "error");
    } finally {
      setIsFetchingSession(false);
    }
  };

  const handleCloseApproved = () => {
    onApproved?.();
    onClose();
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
    <>
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
            {!readOnly && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setMode("reject")}
                  disabled={request._isLoading}
                  className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
                <Button onClick={() => setMode("approve")} disabled={request._isLoading}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </Button>
              </div>
            )}
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
        ) : mode === "reject" ? (
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
        ) : mode === "approved" ? (
          <div className="flex justify-between w-full">
            <Button variant="outline" onClick={handleCloseApproved}>
              Close
            </Button>
            {request.proposed_reschedule_date && !sessionForMakeup?.rescheduled_to_id && (
              <Button
                onClick={handleScheduleMakeup}
                disabled={isFetchingSession}
              >
                {isFetchingSession ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <CalendarPlus className="h-4 w-4 mr-2" />
                    Schedule Makeup Now
                  </>
                )}
              </Button>
            )}
          </div>
        ) : (
          // mode === "rejected"
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-5">
        {/* Admin Guidance Banner */}
        {/* Admin Guidance - only show for pending requests (review mode) */}
        {mode === "review" && (
          request._isLoading ? (
            <div className="h-9 rounded-lg animate-pulse bg-gray-200 dark:bg-gray-700" />
          ) : request.admin_guidance && (
            <div
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
                getGuidanceStyle(request.admin_guidance)
              )}
            >
              <Info className="h-4 w-4 flex-shrink-0" />
              {request.admin_guidance}
            </div>
          )
        )}

        {mode === "review" && (
          <>
            {/* Request Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Student
                </div>
                <StudentInfoBadges
                  student={{
                    student_id: request.student_id,
                    student_name: request.student_name || "Unknown",
                    school_student_id: request.school_student_id,
                    grade: request.grade,
                    lang_stream: request.lang_stream,
                    school: request.school,
                    home_location: request.location,
                  }}
                  showLink
                  showLocationPrefix={showLocationPrefix}
                />
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
                <button
                  onClick={handleSessionClick}
                  className="text-blue-900 dark:text-blue-100 hover:underline flex items-center gap-1"
                >
                  {request.original_session_date}
                  <ExternalLink className="h-3 w-3" />
                </button>
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

            {/* Cross-Enrollment Indicator - show when target differs from source */}
            {request.target_enrollment_id && request.target_enrollment_id !== request.enrollment_id && (
              <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                <div className="text-sm text-purple-800 dark:text-purple-200">
                  <span className="font-medium">Cross-enrollment extension:</span>{" "}
                  This makeup is from an older enrollment (#{request.enrollment_id}).
                  The extension will apply to the student&apos;s current enrollment (#{request.target_enrollment_id}).
                </div>
              </div>
            )}

            {/* Enrollment Context */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {request.target_enrollment_id && request.target_enrollment_id !== request.enrollment_id
                    ? "Current Enrollment Context (will be extended)"
                    : "Enrollment Context"}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={(e) => handleEnrollmentClick(e, 'source')}
                    disabled={isFetchingEnrollment}
                    className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    {isFetchingEnrollment && showEnrollmentPopover === 'source' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ExternalLink className="h-3 w-3" />
                    )}
                    {request.target_enrollment_id && request.target_enrollment_id !== request.enrollment_id
                      ? "Source Enrollment"
                      : "View Enrollment"}
                  </button>
                  {request.target_enrollment_id && request.target_enrollment_id !== request.enrollment_id && (
                    <>
                      <span className="text-gray-400">→</span>
                      <button
                        onClick={(e) => handleEnrollmentClick(e, 'target')}
                        disabled={isFetchingEnrollment}
                        className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        {isFetchingEnrollment && showEnrollmentPopover === 'target' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ExternalLink className="h-3 w-3" />
                        )}
                        Target Enrollment
                      </button>
                    </>
                  )}
                </div>
              </div>
              {/* Cross-enrollment: Show both source and target stats */}
              {request.target_enrollment_id && request.target_enrollment_id !== request.enrollment_id ? (
                <>
                  {/* Source Enrollment Stats */}
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Source Enrollment (#{request.enrollment_id})
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                    <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
                      <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Pending Makeups</div>
                      <div className="font-bold text-gray-900 dark:text-gray-100">
                        {request._isLoading ? (
                          <div className="h-5 w-8 mx-auto rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                        ) : (
                          request.source_pending_makeups_count ?? 0
                        )}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
                      <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Sessions Done</div>
                      <div className="font-bold text-gray-900 dark:text-gray-100">
                        {request._isLoading ? (
                          <div className="h-5 w-8 mx-auto rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                        ) : (
                          request.source_sessions_completed ?? 0
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Target Enrollment Stats */}
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Target Enrollment (#{request.target_enrollment_id})
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
                      <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Current Extensions</div>
                      <div className="font-bold text-gray-900 dark:text-gray-100">
                        {request._isLoading ? (
                          <div className="h-5 w-16 mx-auto rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                        ) : (
                          `${request.current_extension_weeks} weeks`
                        )}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
                      <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Pending Makeups</div>
                      <div className="font-bold text-gray-900 dark:text-gray-100">
                        {request._isLoading ? (
                          <div className="h-5 w-8 mx-auto rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                        ) : (
                          request.pending_makeups_count
                        )}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
                      <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Sessions Done</div>
                      <div className="font-bold text-gray-900 dark:text-gray-100">
                        {request._isLoading ? (
                          <div className="h-5 w-8 mx-auto rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                        ) : (
                          request.sessions_completed
                        )}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
                      <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Lessons Paid</div>
                      <div className="font-bold text-gray-900 dark:text-gray-100">
                        {request._isLoading ? (
                          <div className="h-5 w-8 mx-auto rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                        ) : (
                          request.enrollment_lessons_paid || "N/A"
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* Single enrollment: Show combined stats */
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
                    <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                      Current Extensions
                    </div>
                    <div className="font-bold text-gray-900 dark:text-gray-100">
                      {request._isLoading ? (
                        <div className="h-5 w-16 mx-auto rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                      ) : (
                        `${request.current_extension_weeks} weeks`
                      )}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
                    <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                      Pending Makeups
                    </div>
                    <div className="font-bold text-gray-900 dark:text-gray-100">
                      {request._isLoading ? (
                        <div className="h-5 w-8 mx-auto rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                      ) : (
                        request.pending_makeups_count
                      )}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
                    <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                      Sessions Done
                    </div>
                    <div className="font-bold text-gray-900 dark:text-gray-100">
                      {request._isLoading ? (
                        <div className="h-5 w-8 mx-auto rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                      ) : (
                        request.sessions_completed
                      )}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
                    <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                      Lessons Paid
                    </div>
                    <div className="font-bold text-gray-900 dark:text-gray-100">
                      {request._isLoading ? (
                        <div className="h-5 w-8 mx-auto rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                      ) : (
                        request.enrollment_lessons_paid || "N/A"
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Deadline Display */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">
                    Current End Date
                  </span>
                  {request._isLoading ? (
                    <div className="h-5 w-20 rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                  ) : (
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {request.current_effective_end_date || "N/A"}
                    </span>
                  )}
                </div>
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-between">
                  <span className="text-green-600 dark:text-green-400">
                    If Approved
                  </span>
                  {request._isLoading ? (
                    <div className="h-5 w-20 rounded animate-pulse bg-green-200 dark:bg-green-800" />
                  ) : (
                    <span className="font-medium text-green-700 dark:text-green-300">
                      {request.projected_effective_end_date || "N/A"}
                    </span>
                  )}
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
              <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                <div className="text-sm text-purple-700 dark:text-purple-300">
                  <span className="font-medium">Proposed reschedule:</span>{" "}
                  {request.proposed_reschedule_date}
                  {request.proposed_reschedule_time && ` at ${request.proposed_reschedule_time}`}
                </div>
                <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                  Schedule makeup manually after approval
                </div>
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

        {mode === "approved" && (
          <>
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-green-800 dark:text-green-200 font-medium">
                    Extension Approved
                  </div>
                  <div className="text-sm text-green-700 dark:text-green-300 mt-1">
                    Deadline extended by {request.extension_granted_weeks || weeksToGrant} week{(request.extension_granted_weeks || weeksToGrant) !== 1 ? "s" : ""}
                  </div>
                  {request.reviewed_at && (
                    <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                      Approved on {new Date(request.reviewed_at).toLocaleDateString()}
                      {request.reviewed_by && ` by ${request.reviewed_by}`}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Student & Tutor Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Student
                </div>
                <StudentInfoBadges
                  student={{
                    student_id: request.student_id,
                    student_name: request.student_name || "Unknown",
                    school_student_id: request.school_student_id,
                    grade: request.grade,
                    lang_stream: request.lang_stream,
                    school: request.school,
                    home_location: request.location,
                  }}
                  showLink
                  showLocationPrefix={showLocationPrefix}
                />
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
                <button
                  onClick={handleSessionClick}
                  className="text-blue-900 dark:text-blue-100 hover:underline flex items-center gap-1"
                >
                  {request.original_session_date}
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                  <Clock className="h-4 w-4" />
                  Extension Requested
                </div>
                <div className="text-amber-900 dark:text-amber-100">
                  {request.requested_extension_weeks} week{request.requested_extension_weeks !== 1 ? "s" : ""}
                </div>
              </div>
            </div>

            {/* Tutor's Reason */}
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Reason for Extension
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300">
                {request.reason}
              </div>
            </div>

            {/* Enrollment Links */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500 dark:text-gray-400">View:</span>
              <button
                onClick={(e) => handleEnrollmentClick(e, 'source')}
                disabled={isFetchingEnrollment}
                className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                {isFetchingEnrollment && showEnrollmentPopover === 'source' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ExternalLink className="h-3 w-3" />
                )}
                {request.target_enrollment_id && request.target_enrollment_id !== request.enrollment_id
                  ? "Source Enrollment"
                  : "Enrollment"}
              </button>
              {request.target_enrollment_id && request.target_enrollment_id !== request.enrollment_id && (
                <>
                  <span className="text-gray-400">→</span>
                  <button
                    onClick={(e) => handleEnrollmentClick(e, 'target')}
                    disabled={isFetchingEnrollment}
                    className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    {isFetchingEnrollment && showEnrollmentPopover === 'target' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ExternalLink className="h-3 w-3" />
                    )}
                    Target Enrollment
                  </button>
                </>
              )}
            </div>

            {/* Show rescheduled session info if available */}
            {sessionForMakeup?.rescheduled_to_id && sessionForMakeup.rescheduled_to && (
              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-3">
                  <CalendarCheck className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm text-blue-800 dark:text-blue-200 font-medium">
                      Session has been rescheduled
                    </div>
                    <div className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      New date: {sessionForMakeup.rescheduled_to.session_date}
                      {sessionForMakeup.rescheduled_to.time_slot && ` at ${sessionForMakeup.rescheduled_to.time_slot}`}
                    </div>
                    <a
                      href={`/sessions/${sessionForMakeup.rescheduled_to_id}`}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block"
                    >
                      View rescheduled session →
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Show proposed date if session not yet rescheduled */}
            {request.proposed_reschedule_date && !sessionForMakeup?.rescheduled_to_id && (
              <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                <div className="text-sm text-purple-700 dark:text-purple-300">
                  <span className="font-medium">Tutor&apos;s proposed date:</span>{" "}
                  {request.proposed_reschedule_date}
                  {request.proposed_reschedule_time && ` at ${request.proposed_reschedule_time}`}
                </div>
                <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                  Click &quot;Schedule Makeup Now&quot; to open the scheduler with this date pre-filled
                </div>
              </div>
            )}

            {request.review_notes && (
              <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800">
                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Admin Notes
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  {request.review_notes}
                </div>
              </div>
            )}
          </>
        )}

        {mode === "rejected" && (
          <>
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-start gap-3">
                <XCircle className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-red-800 dark:text-red-200 font-medium">
                    Request Rejected
                  </div>
                  <div className="text-sm text-red-700 dark:text-red-300 mt-1">
                    Extension request was denied
                  </div>
                  {request.reviewed_at && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                      Rejected on {new Date(request.reviewed_at).toLocaleDateString()}
                      {request.reviewed_by && ` by ${request.reviewed_by}`}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Student & Tutor Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Student
                </div>
                <StudentInfoBadges
                  student={{
                    student_id: request.student_id,
                    student_name: request.student_name || "Unknown",
                    school_student_id: request.school_student_id,
                    grade: request.grade,
                    lang_stream: request.lang_stream,
                    school: request.school,
                    home_location: request.location,
                  }}
                  showLink
                  showLocationPrefix={showLocationPrefix}
                />
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
                <button
                  onClick={handleSessionClick}
                  className="text-blue-900 dark:text-blue-100 hover:underline flex items-center gap-1"
                >
                  {request.original_session_date}
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                  <Clock className="h-4 w-4" />
                  Extension Requested
                </div>
                <div className="text-amber-900 dark:text-amber-100">
                  {request.requested_extension_weeks} week{request.requested_extension_weeks !== 1 ? "s" : ""}
                </div>
              </div>
            </div>

            {/* Tutor's Reason */}
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Reason for Extension
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300">
                {request.reason}
              </div>
            </div>

            {/* Enrollment Links */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500 dark:text-gray-400">View:</span>
              <button
                onClick={(e) => handleEnrollmentClick(e, 'source')}
                disabled={isFetchingEnrollment}
                className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                {isFetchingEnrollment && showEnrollmentPopover === 'source' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ExternalLink className="h-3 w-3" />
                )}
                {request.target_enrollment_id && request.target_enrollment_id !== request.enrollment_id
                  ? "Source Enrollment"
                  : "Enrollment"}
              </button>
              {request.target_enrollment_id && request.target_enrollment_id !== request.enrollment_id && (
                <>
                  <span className="text-gray-400">→</span>
                  <button
                    onClick={(e) => handleEnrollmentClick(e, 'target')}
                    disabled={isFetchingEnrollment}
                    className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    {isFetchingEnrollment && showEnrollmentPopover === 'target' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ExternalLink className="h-3 w-3" />
                    )}
                    Target Enrollment
                  </button>
                </>
              )}
            </div>

            {/* Rejection reason */}
            {request.review_notes && (
              <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/30">
                <div className="text-xs text-red-600 dark:text-red-400 uppercase tracking-wide mb-1">
                  Rejection Reason
                </div>
                <div className="text-sm text-red-800 dark:text-red-200">
                  {request.review_notes}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>

    {/* Makeup scheduling modal - rendered outside to avoid nesting */}
    {showMakeupModal && sessionForMakeup && (
      <ScheduleMakeupModal
        session={sessionForMakeup}
        isOpen={showMakeupModal}
        onClose={() => setShowMakeupModal(false)}
        onScheduled={() => {
          setShowMakeupModal(false);
          onApproved?.();
          onClose();
        }}
        initialDate={request.proposed_reschedule_date}
        initialTimeSlot={request.proposed_reschedule_time}
        viaExtensionRequest
        extensionRequestId={request.id}
      />
    )}

    {/* Session Detail Popover */}
    <SessionDetailPopover
      session={sessionForMakeup}
      isOpen={showSessionPopover}
      isLoading={isFetchingSession}
      onClose={() => setShowSessionPopover(false)}
      clickPosition={sessionClickPos}
    />

    {/* Enrollment Detail Popover */}
    <EnrollmentDetailPopover
      enrollment={showEnrollmentPopover === 'source' ? sourceEnrollment : targetEnrollment}
      isOpen={!!showEnrollmentPopover}
      onClose={() => setShowEnrollmentPopover(null)}
      clickPosition={enrollmentClickPos}
    />
    </>
  );
}
