"use client";

import { useState, useEffect } from "react";
import { Loader2, Copy, Check, X, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, IconButton, Input, Segmented, Textarea } from "@/components/controls";
import { enrollmentsAPI, RenewalListItem } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";

interface FeeMessagePanelProps {
  enrollment: RenewalListItem;
  onClose: () => void;
  onMarkSent?: () => void;
}

// The fee message bills for however many lessons it is asked about, so it has to
// be asked about the lessons this renewal was actually created with. Six is the
// usual term, used only when there is no renewal yet to read the count from.
export function renewalLessons(item: RenewalListItem): number {
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
  const [lessonsPaid, setLessonsPaid] = useState(() => renewalLessons(enrollment));
  const [copied, setCopied] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);

  // Fetch fee message when enrollment or language changes
  // Use renewal_enrollment_id if available (for renewals), otherwise use original enrollment id
  const feeMessageEnrollmentId = enrollment.renewal_enrollment_id || enrollment.id;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    enrollmentsAPI.getFeeMessage(feeMessageEnrollmentId, lang, lessonsPaid)
      .then(response => {
        if (!cancelled) {
          setMessage(response.message);
          setOriginalMessage(response.message);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setMessage("Failed to generate fee message");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [feeMessageEnrollmentId, lang, lessonsPaid]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      showToast("Fee message copied!");
      setTimeout(() => {
        setCopied(false);
      }, 500);
    } catch (err) {
      showToast("Failed to copy to clipboard");
    }
  };

  const handleReset = () => {
    setMessage(originalMessage);
    setIsEditable(false);
  };

  const handleMarkSent = async () => {
    if (!enrollment.renewal_enrollment_id) return;

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

  return (
    <div
      className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header with language tabs and lessons selector */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
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
              type="number"
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
        ) : (
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
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80">
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
          <Button variant="primary" onClick={handleCopy} disabled={loading} icon={copied ? Check : Copy}>
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
