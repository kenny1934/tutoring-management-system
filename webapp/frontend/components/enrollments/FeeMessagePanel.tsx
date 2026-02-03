"use client";

import { useState, useEffect } from "react";
import { Loader2, Copy, Check, X, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { enrollmentsAPI, RenewalListItem } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";

interface FeeMessagePanelProps {
  enrollment: RenewalListItem;
  onClose: () => void;
  onMarkSent?: () => void;
}

export function FeeMessagePanel({ enrollment, onClose, onMarkSent }: FeeMessagePanelProps) {
  const { showToast } = useToast();
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [isEditable, setIsEditable] = useState(false);
  const [message, setMessage] = useState('');
  const [originalMessage, setOriginalMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [lessonsPaid, setLessonsPaid] = useState(6);
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
        onClose();
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
  const showMarkSentButton = enrollment.renewal_enrollment_id &&
    enrollment.renewal_status === 'pending_message';
  const showUnmarkSentButton = enrollment.renewal_enrollment_id &&
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
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            <button
              onClick={() => setLang('zh')}
              className={cn(
                "px-3 py-1 text-xs font-medium transition-colors",
                lang === 'zh'
                  ? "bg-primary text-primary-foreground"
                  : "bg-white dark:bg-gray-800 text-foreground/70 hover:bg-gray-100 dark:hover:bg-gray-700"
              )}
            >
              中文
            </button>
            <button
              onClick={() => setLang('en')}
              className={cn(
                "px-3 py-1 text-xs font-medium transition-colors border-l border-gray-300 dark:border-gray-600",
                lang === 'en'
                  ? "bg-primary text-primary-foreground"
                  : "bg-white dark:bg-gray-800 text-foreground/70 hover:bg-gray-100 dark:hover:bg-gray-700"
              )}
            >
              English
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground/60">Lessons:</span>
            <input
              type="number"
              min={1}
              max={52}
              value={lessonsPaid}
              onChange={(e) => setLessonsPaid(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
              className="w-16 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-center"
            />
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <X className="h-4 w-4 text-foreground/50" />
          </button>
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
          <textarea
            value={message}
            onChange={(e) => isEditable && setMessage(e.target.value)}
            readOnly={!isEditable}
            className={cn(
              "w-full h-64 p-3 text-sm font-mono rounded-lg border resize-none transition-colors",
              isEditable
                ? "border-primary bg-white dark:bg-gray-900 focus:ring-2 focus:ring-primary/30"
                : "border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 cursor-default"
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
            className="rounded border-gray-300 text-primary focus:ring-primary"
          />
          Edit before copying
          {isEditable && message !== originalMessage && (
            <button
              onClick={handleReset}
              className="text-xs text-primary hover:underline ml-2"
            >
              Reset
            </button>
          )}
        </label>

        <div className="flex items-center gap-2">
          {showMarkSentButton && (
            <button
              onClick={handleMarkSent}
              disabled={markingSent}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-orange-300 dark:border-orange-600 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors disabled:opacity-50"
            >
              {markingSent ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Mark Sent
            </button>
          )}
          {showUnmarkSentButton && (
            <button
              onClick={handleUnmarkSent}
              disabled={markingSent}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {markingSent ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Undo2 className="h-4 w-4" />
              )}
              Unmark Sent
            </button>
          )}
          <button
            onClick={handleCopy}
            disabled={loading}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              "hover:scale-[1.02] active:scale-[0.98]",
              copied
                ? "bg-green-500 text-white"
                : "bg-primary hover:bg-primary/90 text-primary-foreground"
            )}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy & Close
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
