"use client";

import { useState, useEffect } from "react";
import { BillingWorkflowLink } from "@/components/billing/BillingWorkflowLink";
import { shareOrCopy, useCanShare } from "@/lib/share";
import { FeeMessageContent } from "./FeeMessageContent";
import { enrollmentsAPI, RenewalListItem } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";

interface FeeMessagePanelProps {
  enrollment: Pick<RenewalListItem, 'id' | 'student_id' | 'renewal_enrollment_id' | 'renewal_lessons_paid' | 'renewal_status' | 'billing_managed' | 'billing_payment_id' | 'renewal_billing_payment_id'>;
  onClose: () => void;
  onMarkSent?: () => void;
}

// The fee message bills for however many lessons it is asked about, so it has to
// be asked about the lessons this renewal was actually created with. Six is the
// usual term, used only when there is no renewal yet to read the count from.
export function renewalLessons(item: Pick<RenewalListItem, 'renewal_lessons_paid'>): number {
  return item.renewal_lessons_paid || 6;
}

export function FeeMessagePanel({ enrollment, onClose, onMarkSent }: FeeMessagePanelProps) {
  const { showToast } = useToast();
  const { effectiveRole, isReadOnly } = useAuth();
  const isTutor = effectiveRole === "Tutor" || isReadOnly;
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [isEditable, setIsEditable] = useState(false);
  const [message, setMessage] = useState('');
  const [originalMessage, setOriginalMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lessonsPaid, setLessonsPaid] = useState(() => renewalLessons(enrollment));
  const [copied, setCopied] = useState(false);
  const canShare = useCanShare();
  const [markingSent, setMarkingSent] = useState(false);

  // Fetch fee message when enrollment or language changes
  // Use renewal_enrollment_id if available (for renewals), otherwise use original enrollment id
  const feeMessageEnrollmentId = enrollment.renewal_enrollment_id || enrollment.id;
  const billingPaymentId = enrollment.renewal_enrollment_id ? enrollment.renewal_billing_payment_id : enrollment.billing_payment_id;

  useEffect(() => {
    let cancelled = false;
    if (billingPaymentId) return;
    setLoading(true);
    setLoadError(null);
    setMessage('');

    enrollmentsAPI.getFeeMessage(feeMessageEnrollmentId, lang, lessonsPaid)
      .then(response => {
        if (!cancelled) {
          setMessage(response.message);
          setOriginalMessage(response.message);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Could not load the fee message. Close it and try again.");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [feeMessageEnrollmentId, lang, lessonsPaid, billingPaymentId]);

  const handleCopy = async () => {
    if (loading || loadError || !message) return;
    try {
      if ((await shareOrCopy(message)) !== "copied") return;
      setCopied(true);
      showToast("Fee message copied!");
      setTimeout(() => {
        setCopied(false);
      }, 500);
    } catch {
      showToast("Failed to copy to clipboard", "error");
    }
  };

  const handleReset = () => {
    setMessage(originalMessage);
    setIsEditable(false);
  };

  const handleMarkSent = async () => {
    if (!enrollment.renewal_enrollment_id || loading || loadError || !message) return;

    setMarkingSent(true);
    try {
      await enrollmentsAPI.update(enrollment.renewal_enrollment_id, {
        fee_message_sent: true,
      });
      showToast("Marked as sent!");
      onMarkSent?.();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Please try again";
      showToast(`Failed to mark as sent: ${errorMsg}`, "error");
    } finally {
      setMarkingSent(false);
    }
  };

  const handleUnmarkSent = async () => {
    if (!enrollment.renewal_enrollment_id) return;

    setMarkingSent(true);
    try {
      await enrollmentsAPI.update(enrollment.renewal_enrollment_id, {
        fee_message_sent: false,
      });
      showToast("Unmarked as sent");
      onMarkSent?.();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Please try again";
      showToast(`Failed to unmark: ${errorMsg}`, "error");
    } finally {
      setMarkingSent(false);
    }
  };

  // Show Mark Sent for pending_message status, Unmark Sent for message_sent status
  // Tutors can only see the Copy button, not Mark Sent/Unmark Sent
  const showMarkSentButton = !isTutor && enrollment.renewal_enrollment_id &&
    enrollment.renewal_status === 'pending_message';
  const showUnmarkSentButton = !isTutor && enrollment.renewal_enrollment_id &&
    enrollment.renewal_status === 'message_sent';

  if (billingPaymentId) return <div className="border-t border-line p-4"><BillingWorkflowLink studentId={enrollment.student_id} paymentId={billingPaymentId} onClick={onClose} /></div>;

  return <FeeMessageContent
    language={lang} onLanguageChange={setLang}
    lessons={lessonsPaid} onLessonsChange={setLessonsPaid}
    message={message} onMessageChange={setMessage} originalMessage={originalMessage}
    editable={isEditable} onEditableChange={setIsEditable} onReset={handleReset}
    loading={loading} error={loadError} copied={copied} canShare={canShare}
    markingSent={markingSent} onClose={onClose} onCopy={handleCopy}
    onMarkSent={showMarkSentButton ? handleMarkSent : undefined}
    onUnmarkSent={showUnmarkSentButton ? handleUnmarkSent : undefined}
  />;
}
