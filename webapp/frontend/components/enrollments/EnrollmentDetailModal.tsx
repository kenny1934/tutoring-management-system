"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Calendar, MapPin, Phone, AlertTriangle, CheckCircle, RefreshCcw, ExternalLink, FileText, Copy, Check, Send, Loader2, CreditCard, Clock, XCircle, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { enrollmentsAPI, sessionsAPI, EnrollmentDetailResponse } from "@/lib/api";
import Link from "next/link";
import useSWR from "swr";
import { SessionStatusTag } from "@/components/ui/session-status-tag";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { useLocation } from "@/contexts/LocationContext";
import { EnrollmentDetailPopover } from "@/components/enrollments/EnrollmentDetailPopover";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Enrollment, Session } from "@/types";

interface EnrollmentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  enrollmentId: number | null;
  onCreateRenewal?: (enrollmentId: number) => void;
  /** When true, shows a narrower condensed view for side-by-side layout */
  compact?: boolean;
  /** When true (default), renders its own backdrop. Set to false when used in side-by-side container */
  standalone?: boolean;
  /** When true, hides the close button (used when parent container has its own close) */
  hideCloseButton?: boolean;
  /** Optional label to prefix the header (e.g., "Original" or "Renewal") */
  headerLabel?: string;
  /** Show renewal workflow actions (Mark as Sent, Copy Fee, Mark as Paid) */
  showRenewalActions?: boolean;
  /** Callback when renewal status changes (to refresh parent data) */
  onStatusChange?: () => void;
}

export function EnrollmentDetailModal({
  isOpen,
  onClose,
  enrollmentId,
  onCreateRenewal,
  compact = false,
  standalone = true,
  hideCloseButton = false,
  headerLabel,
  showRenewalActions = false,
  onStatusChange,
}: EnrollmentDetailModalProps) {
  const { selectedLocation } = useLocation();

  // Use SWR for caching
  const { data: detail, isLoading: loading, error, mutate } = useSWR<EnrollmentDetailResponse>(
    isOpen && enrollmentId ? ['enrollment-detail', enrollmentId] : null,
    () => enrollmentsAPI.getDetail(enrollmentId!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }
  );

  // Popover state
  const [popoverEnrollment, setPopoverEnrollment] = useState<Enrollment | null>(null);
  const [popoverSession, setPopoverSession] = useState<Session | null>(null);
  const [clickPosition, setClickPosition] = useState<{ x: number; y: number } | null>(null);
  const [loadingPopover, setLoadingPopover] = useState(false);

  // Renewal action state
  const [markingSent, setMarkingSent] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [copied, setCopied] = useState(false);

  // Confirmation dialog states
  const [confirmPayment, setConfirmPayment] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!isOpen) return null;

  const isExpired = detail && detail.days_until_expiry < 0;
  const isUrgent = detail && detail.days_until_expiry <= 3 && detail.days_until_expiry >= 0;

  // Calculate makeups needing extension
  const makeupsNeedingExtension = detail?.pending_makeups.filter(
    m => !m.has_extension_request || m.extension_request_status === "Rejected"
  ) || [];

  const handleCreateRenewal = () => {
    if (enrollmentId && onCreateRenewal) {
      onCreateRenewal(enrollmentId);
    }
  };

  const handleMarkSent = async () => {
    if (!enrollmentId) return;
    setMarkingSent(true);
    try {
      await enrollmentsAPI.update(enrollmentId, { fee_message_sent: true });
      await mutate();
      onStatusChange?.();
    } finally {
      setMarkingSent(false);
    }
  };

  const handleUnmarkSent = async () => {
    if (!enrollmentId) return;
    setMarkingSent(true);
    try {
      await enrollmentsAPI.update(enrollmentId, { fee_message_sent: false });
      await mutate();
      onStatusChange?.();
    } finally {
      setMarkingSent(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!enrollmentId) return;
    setMarkingPaid(true);
    try {
      await enrollmentsAPI.update(enrollmentId, { payment_status: "Paid" });
      onStatusChange?.();
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleCopyFee = async () => {
    if (!enrollmentId || !detail) return;
    try {
      const { message } = await enrollmentsAPI.getFeeMessage(enrollmentId, 'zh', detail.lessons_paid);
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy fee message:', err);
    }
  };

  const handleCancelEnrollment = async () => {
    if (!enrollmentId) return;

    setIsCancelling(true);
    try {
      await enrollmentsAPI.cancel(enrollmentId);
      onStatusChange?.();
      onClose();
    } catch (err) {
      console.error('Failed to cancel enrollment:', err);
    } finally {
      setIsCancelling(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Popover handlers
  const handleEnrollmentClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!detail) return;

    setClickPosition({ x: e.clientX, y: e.clientY });
    setLoadingPopover(true);
    try {
      const enrollment = await enrollmentsAPI.getById(detail.id);
      setPopoverEnrollment(enrollment);
    } catch (err) {
      console.error("Failed to fetch enrollment:", err);
    } finally {
      setLoadingPopover(false);
    }
  };

  const handleSessionClick = async (sessionId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setClickPosition({ x: e.clientX, y: e.clientY });
    setLoadingPopover(true);
    try {
      const session = await sessionsAPI.getById(sessionId);
      setPopoverSession(session);
    } catch (err) {
      console.error("Failed to fetch session:", err);
    } finally {
      setLoadingPopover(false);
    }
  };

  const modalContent = (
    <motion.div
      // Only animate in standalone mode - parent handles layout animation otherwise
      initial={standalone ? { opacity: 0, scale: 0.95 } : false}
      animate={standalone ? { opacity: 1, scale: 1 } : undefined}
      exit={standalone ? { opacity: 0, scale: 0.95 } : undefined}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "relative rounded-lg shadow-2xl overflow-hidden flex flex-col",
        // Width: compact for side-by-side (responsive), normal for single view
        compact ? "w-full max-w-[22rem]" : "w-full max-w-[32rem]",
        // In standalone mode, use max-h; in side-by-side, fill parent height
        standalone ? "max-h-[90vh]" : "h-full",
        "bg-[#fef9f3] dark:bg-[#2d2618]",
        "border-2 border-[#d4a574] dark:border-[#8b6f47]",
        "paper-texture"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
        <h2 className={cn(
          "font-semibold text-gray-900 dark:text-gray-100 truncate",
          compact ? "text-base" : "text-lg"
        )}>
          {loading ? "Loading..." : detail ? (
            headerLabel
              ? headerLabel
              : (compact ? detail.student_name : `${detail.student_name} - Enrollment Details`)
          ) : "Enrollment Details"}
        </h2>
        {!hideCloseButton && (
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#e8d4b8] dark:hover:bg-[#3d3018] rounded-lg transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className={cn("flex-1 overflow-y-auto", compact ? "p-3 sm:p-4" : "p-4 sm:p-6")}>
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 bg-[#e8d4b8] dark:bg-[#3d3018] rounded animate-pulse" />
                <div className="h-5 w-48 bg-[#e8d4b8]/50 dark:bg-[#3d3018]/50 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Failed to load enrollment details</p>
            <p className="text-sm mt-1 opacity-70">{String(error)}</p>
          </div>
        ) : detail ? (
          <div className={cn("space-y-4", compact && "space-y-3")}>
            {/* Student Info */}
            <div className="flex items-start gap-3">
              <div className={cn("p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg", compact && "p-1")}>
                <User className={cn("text-blue-600 dark:text-blue-400", compact ? "h-4 w-4" : "h-5 w-5")} />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-gray-600 dark:text-gray-400">Student</div>
                <StudentInfoBadges
                  student={{
                    student_id: detail.student_id,
                    student_name: detail.student_name,
                    school_student_id: detail.school_student_id,
                    grade: detail.grade,
                    lang_stream: detail.lang_stream,
                    school: detail.school,
                    home_location: detail.home_location,
                  }}
                  showLocationPrefix={selectedLocation === "All Locations"}
                />
              </div>
            </div>

            {/* Enrollment Link */}
            <div className="flex items-start gap-3">
              <div className={cn("p-1.5 bg-amber-100 dark:bg-amber-900/30 rounded-lg", compact && "p-1")}>
                <FileText className={cn("text-amber-600 dark:text-amber-400", compact ? "h-4 w-4" : "h-5 w-5")} />
              </div>
              <div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Enrollment</div>
                <button
                  onClick={handleEnrollmentClick}
                  disabled={loadingPopover}
                  className={cn(
                    "font-medium text-[#a0704b] hover:underline cursor-pointer",
                    compact && "text-sm",
                    loadingPopover && "opacity-50"
                  )}
                >
                  #{detail.id}
                </button>
              </div>
            </div>

            {/* Tutor & Schedule */}
            <div className="flex items-start gap-3">
              <div className={cn("p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-lg", compact && "p-1")}>
                <Calendar className={cn("text-purple-600 dark:text-purple-400", compact ? "h-4 w-4" : "h-5 w-5")} />
              </div>
              <div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Schedule</div>
                <div className={cn("font-medium text-gray-900 dark:text-gray-100", compact && "text-sm")}>
                  {detail.assigned_day} {detail.assigned_time}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  with {detail.tutor_name}
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="flex items-start gap-3">
              <div className={cn("p-1.5 bg-green-100 dark:bg-green-900/30 rounded-lg", compact && "p-1")}>
                <MapPin className={cn("text-green-600 dark:text-green-400", compact ? "h-4 w-4" : "h-5 w-5")} />
              </div>
              <div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Location</div>
                <div className={cn("font-medium text-gray-900 dark:text-gray-100", compact && "text-sm")}>{detail.location}</div>
              </div>
            </div>

            {/* Dates & Status */}
            <div className={cn("bg-[#f5ebe0] dark:bg-[#251f15] rounded-lg space-y-2", compact ? "p-3" : "p-4 space-y-3")}>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">First Lesson</span>
                <span className={cn("font-medium text-gray-900 dark:text-gray-100", compact && "text-sm")}>
                  {new Date(detail.first_lesson_date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">Effective End</span>
                <span className={cn(
                  "font-medium",
                  compact && "text-sm",
                  isExpired ? "text-red-600 dark:text-red-400" :
                  isUrgent ? "text-orange-600 dark:text-orange-400" :
                  "text-gray-900 dark:text-gray-100"
                )}>
                  {new Date(detail.effective_end_date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {isExpired && (
                    <span className="ml-1 text-xs">
                      ({Math.abs(detail.days_until_expiry)}d ago)
                    </span>
                  )}
                  {isUrgent && (
                    <span className="ml-1 text-xs">
                      ({detail.days_until_expiry === 0 ? "today!" : `${detail.days_until_expiry}d left`})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">Lessons Paid</span>
                <span className={cn("font-medium text-gray-900 dark:text-gray-100", compact && "text-sm")}>{detail.lessons_paid}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">Payment</span>
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded",
                  detail.payment_status === "Paid"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                )}>
                  {detail.payment_status}
                </span>
              </div>
            </div>

            {/* Session Stats - hide progress bar in compact mode */}
            <div className="flex items-start gap-3">
              <div className={cn("p-1.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg", compact && "p-1")}>
                <CheckCircle className={cn("text-emerald-600 dark:text-emerald-400", compact ? "h-4 w-4" : "h-5 w-5")} />
              </div>
              <div className="flex-1">
                <div className="text-xs text-gray-600 dark:text-gray-400">Session Progress</div>
                <div className={cn("font-medium text-gray-900 dark:text-gray-100", compact && "text-sm")}>
                  {detail.sessions_finished} / {detail.sessions_total} completed
                </div>
                {!compact && (
                  <div className="w-full bg-[#e8d4b8] dark:bg-[#3d3018] rounded-full h-2 mt-2">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all"
                      style={{
                        width: detail.sessions_total > 0
                          ? `${(detail.sessions_finished / detail.sessions_total) * 100}%`
                          : "0%",
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Pending Makeups */}
            {detail.pending_makeups.length > 0 && (
              <div className="border border-orange-200 dark:border-orange-800 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-800">
                  <AlertTriangle className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                  <span className="font-medium text-sm text-orange-800 dark:text-orange-300">
                    Pending Makeups ({detail.pending_makeups.length})
                  </span>
                </div>
                <div className="divide-y divide-orange-100 dark:divide-orange-900/30">
                  {detail.pending_makeups.map((session) => (
                    <button
                      key={session.id}
                      onClick={(e) => handleSessionClick(session.id, e)}
                      disabled={loadingPopover}
                      className={cn(
                        "flex items-center justify-between w-full px-3 py-2 hover:bg-orange-50/50 dark:hover:bg-orange-900/10 transition-colors text-left",
                        loadingPopover && "opacity-50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {formatDate(session.session_date)}
                        </span>
                        {session.time_slot && !compact && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {session.time_slot}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <SessionStatusTag status={session.session_status} size="sm" iconOnly />
                        {session.has_extension_request && (
                          <span className={cn(
                            "text-[10px] px-1 py-0.5 rounded",
                            session.extension_request_status === "Pending"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              : session.extension_request_status === "Approved"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          )}>
                            {compact ? (
                              session.extension_request_status === "Pending" ? <Clock className="h-3 w-3" /> :
                              session.extension_request_status === "Approved" ? <Check className="h-3 w-3" /> :
                              <X className="h-3 w-3" />
                            ) : `Ext: ${session.extension_request_status}`}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Extension Warning - more compact in compact mode */}
            {makeupsNeedingExtension.length > 0 && (
              <div className={cn(
                "flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800",
                compact ? "p-2" : "p-3"
              )}>
                <AlertTriangle className={cn("text-amber-600 flex-shrink-0", compact ? "h-4 w-4" : "h-5 w-5 mt-0.5")} />
                <div className={cn("text-sm", compact && "text-xs")}>
                  <p className="font-medium text-amber-800 dark:text-amber-300">
                    {makeupsNeedingExtension.length} makeup{makeupsNeedingExtension.length !== 1 ? 's' : ''} may need extension
                  </p>
                  {!compact && (
                    <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                      Click a session above to request extension.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Contact - hide in compact mode */}
            {!compact && detail.phone && (
              <div className="flex items-start gap-3">
                <div className="p-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <Phone className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Contact</div>
                  <a
                    href={`tel:${detail.phone}`}
                    className="font-medium text-[#a0704b] hover:underline"
                  >
                    {detail.phone}
                  </a>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Footer Actions */}
      {detail && (
        <div className={cn(
          "flex flex-wrap items-center gap-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ebe0] dark:bg-[#251f15] rounded-b-lg",
          compact ? "justify-end px-2 py-2 sm:px-3" : "justify-between px-3 py-2 sm:px-4 sm:py-3"
        )}>
          {!compact && (
            <Link
              href={`/students/${detail.student_id}`}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Student History
            </Link>
          )}

          {/* Right side actions - buttons expand on hover (desktop), wrap on mobile */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Renewal workflow actions */}
            {showRenewalActions && (
              <>
                {/* Copy Fee - subtle icon button */}
                <button
                  onClick={handleCopyFee}
                  className="p-2 rounded-lg hover:bg-[#e8d4b8] dark:hover:bg-[#3d3018] transition-colors"
                  title="Copy fee message"
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-foreground/60" />}
                </button>

                {/* Mark/Unmark Sent toggle */}
                {detail.fee_message_sent ? (
                  <button
                    onClick={handleUnmarkSent}
                    disabled={markingSent}
                    className="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all disabled:opacity-50"
                    title="Unmark Sent"
                  >
                    {markingSent ? <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" /> : <Undo2 className="h-4 w-4 flex-shrink-0" />}
                    <span className="sm:max-w-0 sm:overflow-hidden whitespace-nowrap transition-all duration-200 sm:group-hover:max-w-[100px]">
                      Unmark Sent
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={handleMarkSent}
                    disabled={markingSent}
                    className="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all disabled:opacity-50"
                    title="Mark Sent"
                  >
                    {markingSent ? <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" /> : <Send className="h-4 w-4 flex-shrink-0" />}
                    <span className="sm:max-w-0 sm:overflow-hidden whitespace-nowrap transition-all duration-200 sm:group-hover:max-w-[80px]">
                      Mark Sent
                    </span>
                  </button>
                )}

                {/* Confirm Payment (only when not paid) */}
                {detail.payment_status !== "Paid" && (
                  <button
                    onClick={() => setConfirmPayment(true)}
                    disabled={markingPaid}
                    className="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-medium bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-all disabled:opacity-50"
                    title="Confirm Payment"
                  >
                    {markingPaid ? <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" /> : <CreditCard className="h-4 w-4 flex-shrink-0" />}
                    <span className="sm:max-w-0 sm:overflow-hidden whitespace-nowrap transition-all duration-200 sm:group-hover:max-w-[120px]">
                      Confirm Payment
                    </span>
                  </button>
                )}

                {/* Cancel Enrollment (only for pending/overdue without attended sessions) */}
                {(detail.payment_status === "Pending Payment" || detail.payment_status === "Overdue") && detail.sessions_finished === 0 && (
                  <button
                    onClick={() => setConfirmCancel(true)}
                    disabled={isCancelling}
                    className="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-all disabled:opacity-50"
                    title="Cancel Enrollment"
                  >
                    {isCancelling ? <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" /> : <XCircle className="h-4 w-4 flex-shrink-0" />}
                    <span className="sm:max-w-0 sm:overflow-hidden whitespace-nowrap transition-all duration-200 sm:group-hover:max-w-[130px]">
                      Cancel Enrollment
                    </span>
                  </button>
                )}
              </>
            )}

            {/* Create Renewal button */}
            {onCreateRenewal && (
              <button
                onClick={handleCreateRenewal}
                className={cn(
                  "group flex items-center gap-1.5 rounded-lg text-sm font-medium transition-all",
                  "hover:scale-[1.02] active:scale-[0.98]",
                  "px-2 py-1.5",
                  isExpired
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : isUrgent
                    ? "bg-orange-500 hover:bg-orange-600 text-white"
                    : "bg-[#a0704b] hover:bg-[#8b5d3b] text-white"
                )}
                title={compact ? "Renew" : "Create Renewal"}
              >
                <RefreshCcw className="h-4 w-4 flex-shrink-0" />
                <span className="sm:max-w-0 sm:overflow-hidden whitespace-nowrap transition-all duration-200 sm:group-hover:max-w-[110px]">
                  {compact ? "Renew" : "Create Renewal"}
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );

  // When standalone, render with backdrop
  if (standalone) {
    return (
      <AnimatePresence>
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="relative mx-2 sm:mx-4 w-full max-w-[32rem]">
            {modalContent}
          </div>

          {/* Popovers */}
          {popoverEnrollment && (
            <EnrollmentDetailPopover
              enrollment={popoverEnrollment}
              isOpen={true}
              onClose={() => setPopoverEnrollment(null)}
              clickPosition={clickPosition}
            />
          )}

          {popoverSession && (
            <SessionDetailPopover
              session={popoverSession}
              isOpen={true}
              onClose={() => setPopoverSession(null)}
              clickPosition={clickPosition}
            />
          )}

          {/* Confirm Payment Dialog */}
          <ConfirmDialog
            isOpen={confirmPayment}
            onConfirm={() => {
              setConfirmPayment(false);
              handleMarkPaid();
            }}
            onCancel={() => setConfirmPayment(false)}
            title="Confirm Payment"
            message="Are you sure you want to confirm payment for this enrollment?"
            confirmText="Confirm Payment"
            variant="default"
            loading={markingPaid}
          />

          {/* Confirm Cancel Dialog */}
          <ConfirmDialog
            isOpen={confirmCancel}
            onConfirm={() => {
              setConfirmCancel(false);
              handleCancelEnrollment();
            }}
            onCancel={() => setConfirmCancel(false)}
            title="Cancel Enrollment"
            message="Are you sure you want to cancel this enrollment?"
            consequences={["All scheduled sessions will be cancelled"]}
            confirmText="Cancel Enrollment"
            variant="danger"
            loading={isCancelling}
          />
        </div>
      </AnimatePresence>
    );
  }

  // When not standalone (side-by-side), just render the modal content
  return (
    <>
      {modalContent}

      {/* Popovers */}
      {popoverEnrollment && (
        <EnrollmentDetailPopover
          enrollment={popoverEnrollment}
          isOpen={true}
          onClose={() => setPopoverEnrollment(null)}
          clickPosition={clickPosition}
        />
      )}

      {popoverSession && (
        <SessionDetailPopover
          session={popoverSession}
          isOpen={true}
          onClose={() => setPopoverSession(null)}
          clickPosition={clickPosition}
        />
      )}

      {/* Confirm Payment Dialog */}
      <ConfirmDialog
        isOpen={confirmPayment}
        onConfirm={() => {
          setConfirmPayment(false);
          handleMarkPaid();
        }}
        onCancel={() => setConfirmPayment(false)}
        title="Confirm Payment"
        message="Are you sure you want to confirm payment for this enrollment?"
        confirmText="Confirm Payment"
        variant="default"
        loading={markingPaid}
      />

      {/* Confirm Cancel Dialog */}
      <ConfirmDialog
        isOpen={confirmCancel}
        onConfirm={() => {
          setConfirmCancel(false);
          handleCancelEnrollment();
        }}
        onCancel={() => setConfirmCancel(false)}
        title="Cancel Enrollment"
        message="Are you sure you want to cancel this enrollment?"
        consequences={["All scheduled sessions will be cancelled"]}
        confirmText="Cancel Enrollment"
        variant="danger"
        loading={isCancelling}
      />
    </>
  );
}
