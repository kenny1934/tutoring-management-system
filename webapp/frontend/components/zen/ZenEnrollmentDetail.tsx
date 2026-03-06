"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import type { Enrollment, EnrollmentDetailResponse } from "@/types";
import { enrollmentsAPI } from "@/lib/api";
import { useZenKeyboardFocus, type ZenFocusSection } from "@/contexts/ZenKeyboardFocusContext";
import { setZenStatus } from "./ZenStatusBar";
import { ZenSpinner } from "./ZenSpinner";
import { ZenConfirmDialog } from "./ZenConfirmDialog";
import { getDisplayPaymentStatus } from "@/lib/enrollment-utils";
import { formatShortDate } from "@/lib/formatters";

interface ZenEnrollmentDetailProps {
  enrollmentId: number;
  enrollment: Enrollment;
  onClose: () => void;
  onRefresh?: () => void;
}

/**
 * Inline enrollment detail view shown when pressing Enter on an enrollment.
 *
 * Keyboard shortcuts:
 * - p: Confirm payment (mark as Paid)
 * - m: Toggle fee message sent
 * - f: Generate & copy fee message
 * - x: Cancel enrollment
 * - Esc: Close
 */
export function ZenEnrollmentDetail({
  enrollmentId,
  enrollment,
  onClose,
  onRefresh,
}: ZenEnrollmentDetailProps) {
  const [detail, setDetail] = useState<EnrollmentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    details?: string;
    action: () => Promise<void>;
  } | null>(null);

  // Focus context - set focus to "detail" when mounted, restore on close
  const { focusedSection, setFocusedSection } = useZenKeyboardFocus();
  const previousFocusRef = useRef<ZenFocusSection>(focusedSection);
  const hasSetFocusRef = useRef(false);

  useEffect(() => {
    if (!hasSetFocusRef.current) {
      previousFocusRef.current = focusedSection;
      setFocusedSection("detail");
      hasSetFocusRef.current = true;
    }
    return () => {
      if (previousFocusRef.current && previousFocusRef.current !== "detail") {
        setFocusedSection(previousFocusRef.current);
      } else {
        setFocusedSection("sessions");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch detail on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    enrollmentsAPI.getDetail(enrollmentId).then((data) => {
      if (!cancelled) {
        setDetail(data);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setStatusMessage("Failed to load detail");
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [enrollmentId]);

  const refreshDetail = useCallback(async () => {
    try {
      const data = await enrollmentsAPI.getDetail(enrollmentId);
      setDetail(data);
      onRefresh?.();
    } catch {
      setStatusMessage("Failed to refresh");
    }
  }, [enrollmentId, onRefresh]);

  const handleConfirmPayment = useCallback(async () => {
    setActionInProgress(true);
    try {
      await enrollmentsAPI.update(enrollmentId, { payment_status: "Paid" });
      setZenStatus("Payment confirmed", "success");
      setStatusMessage("Payment confirmed");
      await refreshDetail();
    } catch {
      setStatusMessage("Failed to confirm payment");
    } finally {
      setActionInProgress(false);
      setConfirmAction(null);
    }
  }, [enrollmentId, refreshDetail]);

  const handleToggleFeeSent = useCallback(async () => {
    setActionInProgress(true);
    try {
      const newValue = !detail?.fee_message_sent;
      await enrollmentsAPI.update(enrollmentId, { fee_message_sent: newValue } as Partial<Enrollment>);
      setZenStatus(newValue ? "Fee message marked as sent" : "Fee message marked as unsent", "success");
      setStatusMessage(newValue ? "Marked as sent" : "Marked as unsent");
      await refreshDetail();
    } catch {
      setStatusMessage("Failed to update");
    } finally {
      setActionInProgress(false);
    }
  }, [enrollmentId, detail, refreshDetail]);

  const handleCopyFeeMessage = useCallback(async () => {
    if (!detail) return;
    setActionInProgress(true);
    try {
      const result = await enrollmentsAPI.getFeeMessage(
        enrollmentId, "zh", detail.lessons_paid, detail.is_new_student
      );
      await navigator.clipboard.writeText(result.message);
      setZenStatus("Fee message copied to clipboard", "success");
      setStatusMessage("Fee message copied");
    } catch {
      setStatusMessage("Failed to generate fee message");
    } finally {
      setActionInProgress(false);
    }
  }, [enrollmentId, detail]);

  const handleCancelEnrollment = useCallback(async () => {
    setActionInProgress(true);
    try {
      await enrollmentsAPI.update(enrollmentId, { payment_status: "Cancelled" });
      setZenStatus("Enrollment cancelled", "warning");
      await refreshDetail();
      onClose();
    } catch {
      setStatusMessage("Failed to cancel");
    } finally {
      setActionInProgress(false);
      setConfirmAction(null);
    }
  }, [enrollmentId, refreshDetail, onClose]);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (confirmAction || actionInProgress) return;
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) return;

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          e.stopImmediatePropagation();
          onClose();
          break;

        case "p":
        case "P":
          if (detail && detail.payment_status !== "Paid" && detail.payment_status !== "Cancelled") {
            e.preventDefault();
            e.stopImmediatePropagation();
            setConfirmAction({
              title: "Confirm payment?",
              details: `Mark enrollment #${enrollmentId} as Paid`,
              action: handleConfirmPayment,
            });
          }
          break;

        case "m":
        case "M":
          if (detail) {
            e.preventDefault();
            e.stopImmediatePropagation();
            handleToggleFeeSent();
          }
          break;

        case "f":
        case "F":
          if (detail) {
            e.preventDefault();
            e.stopImmediatePropagation();
            handleCopyFeeMessage();
          }
          break;

        case "x":
        case "X":
          if (detail && detail.payment_status !== "Cancelled") {
            e.preventDefault();
            e.stopImmediatePropagation();
            setConfirmAction({
              title: "Cancel enrollment?",
              details: `This will cancel enrollment #${enrollmentId}`,
              action: handleCancelEnrollment,
            });
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [
    detail, confirmAction, actionInProgress, enrollmentId, onClose,
    handleConfirmPayment, handleToggleFeeSent, handleCopyFeeMessage, handleCancelEnrollment,
  ]);

  // Payment status color
  const paymentColor = (status: string) => {
    if (status === "Paid") return "var(--zen-success)";
    if (status === "Cancelled") return "var(--zen-dim)";
    if (status === "Overdue" || status?.includes("Overdue")) return "var(--zen-error)";
    return "var(--zen-warning)";
  };

  // Expiry color
  const expiryColor = (days: number) => {
    if (days < 0) return "var(--zen-error)";
    if (days <= 7) return "var(--zen-warning)";
    return "var(--zen-dim)";
  };

  // Progress bar
  const progressBar = (finished: number, total: number) => {
    if (total === 0) return "—";
    const width = 10;
    const filled = Math.round((finished / total) * width);
    const empty = width - filled;
    return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${finished}/${total}`;
  };

  const displayStatus = detail ? getDisplayPaymentStatus({ payment_status: detail.payment_status } as Enrollment) : "";

  return (
    <div
      style={{
        margin: "8px 0",
        padding: "12px",
        border: "1px solid var(--zen-accent)",
        backgroundColor: "var(--zen-bg)",
        boxShadow: "0 0 10px var(--zen-accent)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--zen-border)",
        }}
      >
        <span style={{ color: "var(--zen-accent)", fontWeight: "bold" }}>
          ENROLLMENT #{enrollmentId}
        </span>
        <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>
          Press Esc to close
        </span>
      </div>

      {loading ? (
        <div style={{ color: "var(--zen-dim)" }}>
          <ZenSpinner /> Loading enrollment detail...
        </div>
      ) : detail ? (
        <>
          {/* Content Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              gap: "4px 16px",
              fontSize: "13px",
            }}
          >
            <span style={{ color: "var(--zen-dim)" }}>Student:</span>
            <span style={{ color: "var(--zen-fg)" }}>
              {detail.student_name}{" "}
              <span style={{ color: "var(--zen-dim)" }}>({detail.school_student_id || "—"})</span>
            </span>

            <span style={{ color: "var(--zen-dim)" }}>Schedule:</span>
            <span style={{ color: "var(--zen-fg)" }}>
              {enrollment.assigned_day} {enrollment.assigned_time}
            </span>

            <span style={{ color: "var(--zen-dim)" }}>Location:</span>
            <span style={{ color: "var(--zen-fg)" }}>{detail.location}</span>

            <span style={{ color: "var(--zen-dim)" }}>Tutor:</span>
            <span style={{ color: "var(--zen-fg)" }}>{detail.tutor_name}</span>

            <span style={{ color: "var(--zen-dim)" }}>Type:</span>
            <span style={{ color: enrollment.enrollment_type === "Trial" ? "var(--zen-warning)" : "var(--zen-fg)" }}>
              {enrollment.enrollment_type || "Regular"}
            </span>

            <span style={{ color: "var(--zen-dim)" }}>Sessions:</span>
            <span style={{ color: "var(--zen-fg)", fontFamily: "monospace" }}>
              {progressBar(detail.sessions_finished, detail.sessions_total)}
            </span>

            <span style={{ color: "var(--zen-dim)" }}>Lessons Paid:</span>
            <span style={{ color: "var(--zen-fg)" }}>{detail.lessons_paid}</span>

            <span style={{ color: "var(--zen-dim)" }}>Payment:</span>
            <span style={{ color: paymentColor(displayStatus) }}>
              {displayStatus}
            </span>

            <span style={{ color: "var(--zen-dim)" }}>Fee Sent:</span>
            <span style={{ color: detail.fee_message_sent ? "var(--zen-success)" : "var(--zen-dim)" }}>
              {detail.fee_message_sent ? "✓ Sent" : "— Not sent"}
            </span>

            <span style={{ color: "var(--zen-dim)" }}>Dates:</span>
            <span style={{ color: "var(--zen-fg)" }}>
              {formatShortDate(detail.first_lesson_date)} → {formatShortDate(detail.effective_end_date)}
            </span>

            <span style={{ color: "var(--zen-dim)" }}>Expiry:</span>
            <span style={{ color: expiryColor(detail.days_until_expiry) }}>
              {detail.days_until_expiry < 0
                ? `Expired ${Math.abs(detail.days_until_expiry)}d ago`
                : detail.days_until_expiry === 0
                ? "Expires today"
                : `${detail.days_until_expiry}d remaining`}
            </span>

            {enrollment.discount_name && (
              <>
                <span style={{ color: "var(--zen-dim)" }}>Discount:</span>
                <span style={{ color: "var(--zen-fg)" }}>{enrollment.discount_name}</span>
              </>
            )}

            {enrollment.deadline_extension_weeks && enrollment.deadline_extension_weeks > 0 && (
              <>
                <span style={{ color: "var(--zen-dim)" }}>Extension:</span>
                <span style={{ color: "var(--zen-fg)" }}>
                  +{enrollment.deadline_extension_weeks}w
                  {enrollment.extension_notes && ` (${enrollment.extension_notes})`}
                </span>
              </>
            )}
          </div>

          {/* Pending Makeups */}
          {detail.pending_makeups && detail.pending_makeups.length > 0 && (
            <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--zen-border)" }}>
              <span style={{ color: "var(--zen-warning)", fontSize: "12px" }}>
                Pending Makeups ({detail.pending_makeups.length}):
              </span>
              {detail.pending_makeups.map((m, i) => (
                <div key={i} style={{ color: "var(--zen-dim)", fontSize: "12px", marginLeft: "8px" }}>
                  {formatShortDate(m.session_date)} — {m.session_status}
                </div>
              ))}
            </div>
          )}

          {/* Action hints */}
          <div
            style={{
              marginTop: "12px",
              paddingTop: "8px",
              borderTop: "1px solid var(--zen-border)",
              color: "var(--zen-dim)",
              fontSize: "12px",
              display: "flex",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            {detail.payment_status !== "Paid" && detail.payment_status !== "Cancelled" && (
              <span>[<span style={{ color: "var(--zen-accent)" }}>p</span>] Pay</span>
            )}
            <span>[<span style={{ color: "var(--zen-accent)" }}>m</span>] {detail.fee_message_sent ? "Unmark" : "Mark"} Sent</span>
            <span>[<span style={{ color: "var(--zen-accent)" }}>f</span>] Fee Msg</span>
            {detail.payment_status !== "Cancelled" && (
              <span>[<span style={{ color: "var(--zen-accent)" }}>x</span>] Cancel</span>
            )}
          </div>

          {/* Status message */}
          {statusMessage && (
            <div style={{ marginTop: "4px", color: "var(--zen-accent)", fontSize: "12px" }}>
              {statusMessage}
            </div>
          )}
        </>
      ) : (
        <div style={{ color: "var(--zen-error)" }}>Failed to load enrollment detail</div>
      )}

      {/* Confirm dialog */}
      {confirmAction && (
        <ZenConfirmDialog
          title={confirmAction.title}
          details={confirmAction.details}
          onConfirm={confirmAction.action}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
