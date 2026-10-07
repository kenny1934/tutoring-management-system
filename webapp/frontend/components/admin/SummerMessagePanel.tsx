"use client";

import { useMemo, useState } from "react";
import { Copy, Check, X, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, IconButton, Segmented, Textarea } from "@/components/controls";
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
        <IconButton size="sm" label="Close" icon={X} onClick={onClose} />
      </div>

      <div className="p-4">
        <Textarea
          value={message}
          onChange={(e) => { if (isEditable) setDraft(e.target.value); }}
          readOnly={!isEditable}
          aria-label="Message"
          className={cn("h-64 resize-none font-mono", !isEditable && "cursor-default bg-tint")}
        />
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80">
        <label className="flex items-center gap-2 text-sm text-foreground/70 cursor-pointer">
          <input
            type="checkbox"
            checked={isEditable}
            onChange={(e) => setIsEditable(e.target.checked)}
            className="rounded border-gray-300 text-accent-ink focus:ring-primary"
          />
          Edit before copying
          {isEditable && draft !== null && (
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-accent-ink hover:underline ml-2"
            >
              Reset
            </button>
          )}
        </label>

        <div className="flex items-center gap-2">
          {showMarkSent && (
            <Button
              onClick={handleMarkSent}
              loading={marking}
              icon={Check}
              iconClassName="text-orange-600 dark:text-orange-400"
            >
              Mark sent
            </Button>
          )}
          {showUnmarkSent && (
            <Button variant="quiet" onClick={handleUnmarkSent} loading={marking} icon={Undo2}>
              Unmark sent
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handleCopy}
            icon={copied ? Check : Copy}
          >
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
