"use client";

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { Copy, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMakeupMessage } from "@/lib/makeup-message";
import { useToast } from "@/contexts/ToastContext";
import type { Session } from "@/types";

interface MakeupMessageModalProps {
  session: Session;
  isOpen: boolean;
  onClose: () => void;
  usePortal?: boolean;
}

export function MakeupMessageModal({ session, isOpen, onClose, usePortal = true }: MakeupMessageModalProps) {
  const { showToast } = useToast();
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const originalMessage = useMemo(() => formatMakeupMessage(session, lang), [session, lang]);
  const [message, setMessage] = useState(originalMessage);
  const [isEditable, setIsEditable] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset message when language changes
  const handleLangChange = (newLang: 'zh' | 'en') => {
    setLang(newLang);
    const newMsg = formatMakeupMessage(session, newLang);
    setMessage(newMsg);
    setIsEditable(false);
  };

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      showToast("Message copied!");
      setTimeout(() => setCopied(false), 500);
    } catch {
      showToast("Failed to copy to clipboard", "error");
    }
  };

  const handleReset = () => {
    setMessage(originalMessage);
    setIsEditable(false);
  };

  const compact = !usePortal;

  const content = (
    <div className="fixed inset-0 z-50 sm:flex sm:items-center sm:justify-center" onClick={(e) => e.stopPropagation()}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal — full-screen on mobile, centered card on sm+ */}
      <div className={cn(
        "relative w-full h-full sm:h-auto flex flex-col bg-white dark:bg-gray-900 shadow-xl border border-gray-200 dark:border-gray-700 sm:rounded-xl sm:mx-4 overflow-hidden",
        compact ? "sm:max-w-[28rem]" : "sm:max-w-[32rem]"
      )}>
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between border-b border-gray-200 dark:border-gray-700",
          compact ? "px-3 py-2" : "px-4 py-3"
        )}>
          <div className={cn("flex items-center", compact ? "gap-2" : "gap-3")}>
            <h3 className={cn("font-semibold text-foreground", compact ? "text-xs" : "text-sm")}>Make-up Message</h3>
            <div className="flex rounded-md overflow-hidden border border-gray-300 dark:border-gray-600">
              <button
                onClick={() => handleLangChange('zh')}
                className={cn(
                  "font-medium transition-colors",
                  compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs",
                  lang === 'zh'
                    ? "bg-sky-500 text-white"
                    : "bg-white dark:bg-gray-800 text-foreground/70 hover:bg-gray-100 dark:hover:bg-gray-700"
                )}
              >
                中文
              </button>
              <button
                onClick={() => handleLangChange('en')}
                className={cn(
                  "font-medium transition-colors border-l border-gray-300 dark:border-gray-600",
                  compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs",
                  lang === 'en'
                    ? "bg-sky-500 text-white"
                    : "bg-white dark:bg-gray-800 text-foreground/70 hover:bg-gray-100 dark:hover:bg-gray-700"
                )}
              >
                English
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <X className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4", "text-foreground/50")} />
          </button>
        </div>

        {/* Message content */}
        <div className={cn("flex-1 min-h-0 flex flex-col", compact ? "p-3" : "p-4")}>
          <textarea
            value={message}
            onChange={(e) => isEditable && setMessage(e.target.value)}
            readOnly={!isEditable}
            className={cn(
              "w-full p-3 font-mono rounded-lg border resize-none transition-colors flex-1",
              compact ? "sm:flex-none sm:h-36 text-xs" : "sm:flex-none sm:h-48 text-sm",
              isEditable
                ? "border-sky-400 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-sky-300/30"
                : "border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 cursor-default"
            )}
          />
        </div>

        {/* Footer */}
        <div className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 dark:border-gray-700",
          compact ? "px-3 py-2" : "px-4 py-3"
        )}>
          <label className={cn(
            "flex items-center gap-2 text-foreground/70 cursor-pointer min-w-0",
            compact ? "text-xs" : "text-sm"
          )}>
            <input
              type="checkbox"
              checked={isEditable}
              onChange={(e) => setIsEditable(e.target.checked)}
              className="rounded border-gray-300 text-sky-500 focus:ring-sky-400 shrink-0"
            />
            <span className="whitespace-nowrap">Edit before copying</span>
            {isEditable && message !== originalMessage && (
              <button
                onClick={handleReset}
                className="text-xs text-sky-600 dark:text-sky-400 hover:underline whitespace-nowrap"
              >
                Reset
              </button>
            )}
          </label>

          <button
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-2 rounded-lg font-medium transition-all shrink-0 ml-auto",
              "hover:scale-[1.02] active:scale-[0.98]",
              compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
              copied
                ? "bg-green-500 text-white"
                : "bg-sky-500 hover:bg-sky-600 text-white"
            )}
          >
            {copied ? (
              <>
                <Check className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                Copied!
              </>
            ) : (
              <>
                <Copy className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                Copy
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  if (usePortal && typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
}
