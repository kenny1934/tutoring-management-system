"use client";

import type { ReactNode } from "react";
import { Loader2, Copy, Share, Check, X, Undo2 } from "lucide-react";
import { Button, IconButton, Input, Segmented, Textarea } from "@/components/controls";
import { cn } from "@/lib/utils";

export interface FeeMessageContentProps {
  language: "zh" | "en";
  onLanguageChange: (language: "zh" | "en") => void;
  lessons: number;
  /** Saved enrollments have a fixed count. Only legacy previews may change it. */
  onLessonsChange?: (lessons: number) => void;
  message: string;
  onMessageChange?: (message: string) => void;
  originalMessage?: string;
  editable?: boolean;
  onEditableChange?: (editable: boolean) => void;
  onReset?: () => void;
  loading?: boolean;
  error?: ReactNode;
  feedback?: ReactNode;
  busy?: boolean;
  copied?: boolean;
  canShare?: boolean;
  canCopy?: boolean;
  onCopy: () => void;
  onClose: () => void;
  closeLabel?: string;
  onMarkSent?: () => void;
  onUnmarkSent?: () => void;
  markingSent?: boolean;
}

/** The legacy and combined enrollment flows share the same message controls. */
export function FeeMessageContent({
  language, onLanguageChange, lessons, onLessonsChange, message, onMessageChange,
  originalMessage, editable = false, onEditableChange, onReset, loading = false,
  error, feedback, busy = false, copied = false, canShare = false, canCopy = true,
  onCopy, onClose, closeLabel = "Close", onMarkSent, onUnmarkSent, markingSent = false,
}: FeeMessageContentProps) {
  const messageUnavailable = loading || !!error || !message || !canCopy;
  return <section aria-label="Fee message" className="border-t border-line bg-paper" onClick={event => event.stopPropagation()}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-wash px-4 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-foreground/60">Language:</span>
        <Segmented label="Message language" value={language} onChange={onLanguageChange} options={[
          { value: "zh", label: "中文", disabled: busy },
          { value: "en", label: "English", disabled: busy },
        ]} />
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-foreground/60">Lessons:</span>
          <Input type="number" inputMode="numeric" size="sm" min={1} max={52} value={lessons}
            readOnly={!onLessonsChange} disabled={busy}
            onChange={onLessonsChange ? event => onLessonsChange(Math.max(1, Math.min(52, Number(event.target.value) || 1))) : undefined}
            aria-label="Lessons" className="w-16 text-center" />
        </div>
        <IconButton label={closeLabel} icon={X} size="sm" disabled={busy} onClick={onClose} />
      </div>
    </div>
    <div className="p-4">
      {loading ? <div className="flex items-center justify-center py-8" role="status">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" aria-hidden="true" />
        <span className="ml-2 text-sm text-foreground/60">Generating message...</span>
      </div> : error ? <div role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</div> : <Textarea
        value={message} onChange={event => { if (editable) onMessageChange?.(event.target.value); }}
        readOnly={!editable || !onMessageChange} disabled={busy} aria-label="Fee message"
        className={cn("h-64 resize-none p-3 font-mono transition-colors", !editable && "cursor-default bg-tint")} />}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper px-4 py-3">
      {onEditableChange ? <div className="flex items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground/70">
          <input type="checkbox" checked={editable} disabled={busy} onChange={event => onEditableChange(event.target.checked)} className="rounded border-field text-accent-ink focus:ring-primary" />
          Edit before copying
        </label>
        {editable && onReset && message !== originalMessage && <button type="button" disabled={busy} onClick={onReset} className="ml-2 text-xs text-accent-ink hover:underline">Reset</button>}
      </div> : <span />}
      <div data-billing-copy-actions className="flex flex-wrap items-center gap-2">
        {onMarkSent && <Button onClick={onMarkSent} loading={markingSent} disabled={messageUnavailable || busy} icon={Check} iconClassName="text-orange-700 dark:text-orange-400">Mark sent</Button>}
        {onUnmarkSent && <Button onClick={onUnmarkSent} loading={markingSent} disabled={busy} icon={Undo2} variant="quiet">Unmark sent</Button>}
        <Button variant="primary" onClick={onCopy} disabled={messageUnavailable || busy} icon={copied ? Check : canShare ? Share : Copy}>{copied ? "Copied!" : canShare ? "Share" : "Copy"}</Button>
        {feedback}
      </div>
    </div>
  </section>;
}
