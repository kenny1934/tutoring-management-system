"use client";

import { useState, useEffect } from "react";
import { BillingWorkflowLink } from "@/components/billing/BillingWorkflowLink";
import { Loader2, Copy, Share, Check, X, Undo2 } from "lucide-react";
import { shareOrCopy, useCanShare } from "@/lib/share";
import { cn } from "@/lib/utils";
import { Button, IconButton, Input, Segmented, Textarea } from "@/components/controls";
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

  return (
    <div
      className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header with language tabs and lessons selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground/60">Language:</span>
          <Segmented
            label="Message language"
            value={lang}
            onChange={setLang}
            options={[
              { value: "zh", label: "中文" },
              { value: "en", label: "English" },
            ]}
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground/60">Lessons:</span>
            <Input
              type="number" inputMode="numeric"
              size="sm"
              min={1}
              max={52}
              value={lessonsPaid}
              onChange={(e) => setLessonsPaid(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
              aria-label="Lessons"
              className="w-16 text-center"
            />
          </div>
          <IconButton label="Close" icon={X} size="sm" onClick={onClose} />
        </div>
      </div>

      {/* Message content */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
            <span className="ml-2 text-sm text-foreground/60">Generating message...</span>
          </div>
        ) : loadError ? <p role="alert" className="text-sm text-red-700 dark:text-red-300">{loadError}</p> : (
          <Textarea
            value={message}
            onChange={(e) => isEditable && setMessage(e.target.value)}
            readOnly={!isEditable}
            aria-label="Fee message"
            className={cn(
              "h-64 p-3 font-mono resize-none transition-colors",
              // Read-only, the box sits back on the tint so it reads as a preview.
              !isEditable && "bg-tint cursor-default"
            )}
          />
        )}
      </div>

      {/* Footer with controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80">
        <label className="flex items-center gap-2 text-sm text-foreground/70 cursor-pointer">
          <input
            type="checkbox"
            checked={isEditable}
            onChange={(e) => setIsEditable(e.target.checked)}
            className="rounded border-gray-300 text-accent-ink focus:ring-primary"
          />
          Edit before copying
          {isEditable && message !== originalMessage && (
            <button
              onClick={handleReset}
              className="text-xs text-accent-ink hover:underline ml-2"
            >
              Reset
            </button>
          )}
        </label>

        <div className="flex items-center gap-2">
          {showMarkSentButton && (
            <Button
              onClick={handleMarkSent}
              loading={markingSent}
              disabled={loading || !!loadError || !message}
              icon={Check}
              iconClassName="text-orange-700 dark:text-orange-400"
            >
              Mark sent
            </Button>
          )}
          {showUnmarkSentButton && (
            <Button onClick={handleUnmarkSent} loading={markingSent} icon={Undo2} variant="quiet">
              Unmark sent
            </Button>
          )}
          <Button variant="primary" onClick={handleCopy} disabled={loading || !!loadError || !message} icon={copied ? Check : canShare ? Share : Copy}>
            {copied ? "Copied!" : canShare ? "Share" : "Copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
