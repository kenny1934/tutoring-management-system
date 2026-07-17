"use client";

import { useMemo, useState } from "react";
import { Copy, Check, X, Undo2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { summerAPI } from "@/lib/api";
import type { SummerApplication, SummerCourseConfig } from "@/types";
import type { DiscountResult } from "@/lib/summer-discounts";
import {
  formatSummerSchedule,
  formatSummerFeeMessage,
  type SummerMessageLang,
} from "@/lib/summer-fee-message";

export type SummerMessageMode = "schedule" | "fee";

interface SummerMessagePanelProps {
  app: SummerApplication;
  config: SummerCourseConfig;
  // Required for mode="fee". Schedule mode ignores it.
  discount?: DiscountResult;
  mode: SummerMessageMode;
  onClose: () => void;
  // Fires with the new application_status after the backend accepts the
  // mark/unmark. The parent should apply this optimistically and then
  // trigger a refetch — callers that ignore the argument get a stale modal.
  onMarkSent?: (newStatus: string) => void;
}

const STATUS_FEE_SENT = "Fee Sent";
const STATUS_PLACEMENT_CONFIRMED = "Placement Confirmed";
const MARK_SENT_FROM = new Set(["Placement Offered", STATUS_PLACEMENT_CONFIRMED]);

export function SummerMessagePanel({
  app,
  config,
  discount,
  mode,
  onClose,
  onMarkSent,
}: SummerMessagePanelProps) {
  const { showToast } = useToast();
  const [lang, setLang] = useState<SummerMessageLang>("zh");
  const [isEditable, setIsEditable] = useState(false);
  const [copied, setCopied] = useState(false);
  const [marking, setMarking] = useState(false);

  const generated = useMemo(() => {
    if (mode === "fee") {
      if (!discount) return "";
      return formatSummerFeeMessage(app, config, discount, lang);
    }
    return formatSummerSchedule(app, lang);
  }, [mode, lang, app, config, discount]);

  // Draft is null whenever the user hasn't overridden the generated text,
  // so lang/mode toggles and prop updates show the fresh template without
  // an effect→setState round-trip.
  const [draft, setDraft] = useState<string | null>(null);
  const message = isEditable && draft !== null ? draft : generated;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      showToast(mode === "fee" ? "Fee message copied!" : "Schedule copied!");
      setTimeout(() => setCopied(false), 500);
    } catch {
      showToast("Failed to copy to clipboard", "error");
    }
  };

  const handleReset = () => {
    setDraft(null);
    setIsEditable(false);
  };

  const handleMarkSent = async () => {
    setMarking(true);
    try {
      await summerAPI.updateApplication(app.id, { application_status: STATUS_FEE_SENT });
      showToast("Marked as sent!");
      onMarkSent?.(STATUS_FEE_SENT);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Please try again";
      showToast(`Failed to mark as sent: ${msg}`, "error");
    } finally {
      setMarking(false);
    }
  };

  const handleUnmarkSent = async () => {
    setMarking(true);
    try {
      await summerAPI.updateApplication(app.id, {
        application_status: STATUS_PLACEMENT_CONFIRMED,
      });
      showToast("Unmarked as sent");
      onMarkSent?.(STATUS_PLACEMENT_CONFIRMED);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Please try again";
      showToast(`Failed to unmark: ${msg}`, "error");
    } finally {
      setMarking(false);
    }
  };

  const showMarkSent = mode === "fee" && MARK_SENT_FROM.has(app.application_status);
  const showUnmarkSent = mode === "fee" && app.application_status === STATUS_FEE_SENT;

  const title = mode === "fee" ? "Fee message" : "Schedule";

  return (
    <div
      className="bg-gray-50 dark:bg-gray-800/50"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-foreground">{title}</span>
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            <button
              type="button"
              onClick={() => setLang("zh")}
              className={cn(
                "px-3 py-1 text-xs font-medium transition-colors",
                lang === "zh"
                  ? "bg-primary text-primary-foreground"
                  : "bg-white dark:bg-gray-800 text-foreground/70 hover:bg-gray-100 dark:hover:bg-gray-700",
              )}
            >
              中文
            </button>
            <button
              type="button"
              onClick={() => setLang("en")}
              className={cn(
                "px-3 py-1 text-xs font-medium transition-colors border-l border-gray-300 dark:border-gray-600",
                lang === "en"
                  ? "bg-primary text-primary-foreground"
                  : "bg-white dark:bg-gray-800 text-foreground/70 hover:bg-gray-100 dark:hover:bg-gray-700",
              )}
            >
              English
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4 text-foreground/50" />
        </button>
      </div>

      <div className="p-4">
        <textarea
          value={message}
          onChange={(e) => { if (isEditable) setDraft(e.target.value); }}
          readOnly={!isEditable}
          className={cn(
            "w-full h-64 p-3 text-sm font-mono rounded-lg border resize-none transition-colors",
            isEditable
              ? "border-primary bg-white dark:bg-gray-900 focus:ring-2 focus:ring-primary/30"
              : "border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 cursor-default",
          )}
        />
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80">
        <label className="flex items-center gap-2 text-sm text-foreground/70 cursor-pointer">
          <input
            type="checkbox"
            checked={isEditable}
            onChange={(e) => setIsEditable(e.target.checked)}
            className="rounded border-gray-300 text-primary focus:ring-primary"
          />
          Edit before copying
          {isEditable && draft !== null && (
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-primary hover:underline ml-2"
            >
              Reset
            </button>
          )}
        </label>

        <div className="flex items-center gap-2">
          {showMarkSent && (
            <button
              type="button"
              onClick={handleMarkSent}
              disabled={marking}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-orange-300 dark:border-orange-600 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors disabled:opacity-50"
            >
              {marking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Mark Sent
            </button>
          )}
          {showUnmarkSent && (
            <button
              type="button"
              onClick={handleUnmarkSent}
              disabled={marking}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {marking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
              Unmark Sent
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              "hover:scale-[1.02] active:scale-[0.98]",
              copied
                ? "bg-green-500 text-white"
                : "bg-primary hover:bg-primary/90 text-primary-foreground",
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
                Copy
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
