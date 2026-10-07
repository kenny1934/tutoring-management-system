"use client";

import { useState } from "react";
import useSWR from "swr";
import { Copy, Check, X, Undo2, Loader2, AlertTriangle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, IconButton, Segmented, Textarea } from "@/components/controls";
import { useToast } from "@/contexts/ToastContext";
import { regularAPI } from "@/lib/api";
import type { RegularApplication } from "@/types";

export type RegularMessageMode = "schedule" | "fee";
type MessageLang = "zh" | "en";

const STATUS_PLACEMENT_OFFERED = "Placement Offered";
const STATUS_PLACEMENT_CONFIRMED = "Placement Confirmed";
const STATUS_FEE_SENT = "Fee Sent";

// Which statuses each mark button is offered from, mirroring the summer panel:
// marking is a record of "this message has gone out", not a free status jump.
const OFFER_FROM = new Set(["Submitted", "Under Review"]);
const FEE_SENT_FROM = new Set([STATUS_PLACEMENT_OFFERED, STATUS_PLACEMENT_CONFIRMED]);

interface RegularMessagePanelProps {
  app: RegularApplication;
  mode: RegularMessageMode;
  /** Fee inputs, so the quoted total matches what Publish will charge. */
  lessonsPaid: number;
  discountId?: number | null;
  firstLessonDate?: string | null;
  onClose: () => void;
  /** Fires with the new application_status once the backend accepts it. */
  onMarked?: (newStatus: string) => void;
  readOnly?: boolean;
}

export function RegularMessagePanel({
  app,
  mode,
  lessonsPaid,
  discountId,
  firstLessonDate,
  onClose,
  onMarked,
  readOnly = false,
}: RegularMessagePanelProps) {
  const { showToast } = useToast();
  const [lang, setLang] = useState<MessageLang>("zh");
  const [isEditable, setIsEditable] = useState(false);
  const [copied, setCopied] = useState(false);
  const [marking, setMarking] = useState(false);

  // The messages are generated server-side from the same schedule, discount
  // and holiday calendar the publish flow uses, so the parent is never quoted
  // a fee or a date the enrollment then contradicts.
  const { data, error, isLoading } = useSWR(
    ["regular-app-messages", app.id, lessonsPaid, discountId ?? null, firstLessonDate ?? null],
    () =>
      regularAPI.getApplicationMessages(app.id, {
        lessons_paid: lessonsPaid,
        discount_id: discountId ?? null,
        first_lesson_date: firstLessonDate ?? null,
      }),
    { revalidateOnFocus: false }
  );

  const generated = data
    ? mode === "fee"
      ? lang === "zh" ? data.fee_zh : data.fee_en
      : lang === "zh" ? data.schedule_zh : data.schedule_en
    : "";

  // Draft is null until the admin edits, so language and mode toggles show the
  // fresh template without an effect round-trip.
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

  const setStatus = async (next: string, successMessage: string) => {
    setMarking(true);
    try {
      await regularAPI.updateApplication(app.id, { application_status: next });
      showToast(successMessage);
      onMarked?.(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Please try again";
      showToast(`Failed to update status: ${msg}`, "error");
    } finally {
      setMarking(false);
    }
  };

  const status = app.application_status;
  const showMarkOffered = mode === "schedule" && !readOnly && OFFER_FROM.has(status);
  const showUnmarkOffered = mode === "schedule" && !readOnly && status === STATUS_PLACEMENT_OFFERED;
  const showMarkSent = mode === "fee" && !readOnly && FEE_SENT_FROM.has(status);
  const showUnmarkSent = mode === "fee" && !readOnly && status === STATUS_FEE_SENT;

  const title = mode === "fee" ? "Fee message" : "Schedule";

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50" onClick={(e) => e.stopPropagation()}>
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
        <IconButton label="Close" icon={X} size="sm" onClick={onClose} />
      </div>

      {data?.schedule_source === "preference" && (
        <div className="flex items-start gap-1.5 px-4 py-2 text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
          <span>
            No slot assigned yet, so this uses the first-choice preference. Assign a
            slot on the Arrangement tab to quote the real class.
          </span>
        </div>
      )}
      {data && !data.has_student_link && (
        <div className="flex items-start gap-1.5 px-4 py-2 text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
          <span>No student record linked, so the message carries no student ID.</span>
        </div>
      )}

      <div className="p-4">
        {isLoading ? (
          <div className="h-64 flex items-center justify-center gap-2 text-sm text-muted-foreground rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating...
          </div>
        ) : error ? (
          <div className="h-64 flex items-center justify-center px-4 text-center text-sm text-red-700 dark:text-red-300 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
            {error instanceof Error ? error.message : "Could not generate this message."}
          </div>
        ) : (
          <Textarea
            value={message}
            onChange={(e) => { if (isEditable) setDraft(e.target.value); }}
            readOnly={!isEditable}
            aria-label={title}
            className={cn(
              "h-64 resize-none font-mono",
              !isEditable && "cursor-default bg-tint"
            )}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80">
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
          {showMarkOffered && (
            <MarkButton
              busy={marking}
              tone="offer"
              icon={Check}
              label="Mark offered"
              onClick={() => setStatus(STATUS_PLACEMENT_OFFERED, "Marked as offered!")}
            />
          )}
          {showUnmarkOffered && (
            <MarkButton
              busy={marking}
              tone="undo"
              icon={Undo2}
              label="Unmark offered"
              onClick={() => setStatus("Under Review", "Unmarked as offered")}
            />
          )}
          {showMarkSent && (
            <MarkButton
              busy={marking}
              tone="offer"
              icon={Check}
              label="Mark sent"
              onClick={() => setStatus(STATUS_FEE_SENT, "Marked as sent!")}
            />
          )}
          {showUnmarkSent && (
            <MarkButton
              busy={marking}
              tone="undo"
              icon={Undo2}
              label="Unmark sent"
              onClick={() => setStatus(STATUS_PLACEMENT_CONFIRMED, "Unmarked as sent")}
            />
          )}
          <Button
            variant="primary"
            onClick={handleCopy}
            disabled={!message}
            icon={copied ? Check : Copy}
          >
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MarkButton({
  busy,
  tone,
  icon,
  label,
  onClick,
}: {
  busy: boolean;
  tone: "offer" | "undo";
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  // Marking moves the application on, so its icon carries the offer colour.
  // Undoing is the quieter of the two.
  return (
    <Button
      variant={tone === "offer" ? "secondary" : "quiet"}
      onClick={onClick}
      loading={busy}
      icon={icon}
      iconClassName={tone === "offer" ? "text-orange-600 dark:text-orange-400" : undefined}
    >
      {label}
    </Button>
  );
}
