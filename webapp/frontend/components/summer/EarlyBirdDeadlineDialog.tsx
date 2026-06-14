"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api";
import { formatHKDate } from "@/lib/summer-utils";

// Structured payload from the backend 409 when marking an application
// Paid/Enrolled after an early-bird deadline would strip a discount the parent
// could keep by being recorded as paid on/before the deadline. Mirrors
// `_early_bird_loss_on_stamp` in routers/summer_course.py.
export interface EarlyBirdDeadlineDetail {
  code: "early_bird_deadline_passed";
  message: string;
  tier_code: string;
  tier_name_en: string | null;
  tier_name_zh: string | null;
  deadline: string | null; // YYYY-MM-DD
  amount_at_risk: number;
  full_fee: number;
  discounted_fee: number;
}

export interface AffectedApp {
  id: number;
  studentName: string;
  detail: EarlyBirdDeadlineDetail;
}

interface Props {
  open: boolean;
  apps: AffectedApp[];
  busy?: boolean;
  /** Single-app only: keep the discount by recording the real payment date. */
  onEnterDate?: (isoDate: string) => void;
  /** Acknowledge the loss for every listed app and mark them paid today. */
  onDropAll: () => void;
  onCancel: () => void;
}

/** Extract the early-bird-deadline payload from a caught error, or null. Shared
 *  by every callsite that marks an application Paid (detail modal, batch update,
 *  inline dropdown) so the 409 shape lives in exactly one place. */
export function earlyBirdDetail(e: unknown): EarlyBirdDeadlineDetail | null {
  return e instanceof ApiError &&
    e.status === 409 &&
    (e.detail as EarlyBirdDeadlineDetail | undefined)?.code === "early_bird_deadline_passed"
    ? (e.detail as EarlyBirdDeadlineDetail)
    : null;
}

/** Deadline for display, falling back to a generic noun when absent. */
function deadlineLabel(iso: string | null): string {
  return formatHKDate(iso) || "the deadline";
}

function tierLabel(d: EarlyBirdDeadlineDetail): string {
  return d.tier_name_en || d.tier_name_zh || d.tier_code;
}

export function EarlyBirdDeadlineDialog({
  open,
  apps,
  busy,
  onEnterDate,
  onDropAll,
  onCancel,
}: Props) {
  const single = apps.length === 1 ? apps[0] : null;
  const deadline = apps[0]?.detail.deadline ?? null;

  // Date input defaults to the deadline — the latest date that still keeps the
  // discount. Capped at the deadline so the "keep" path can't pick a date that
  // would silently drop it anyway. Re-seed when reopened for a different app.
  const [payDate, setPayDate] = useState(deadline ?? "");
  useEffect(() => {
    if (open) setPayDate(deadline ?? "");
  }, [open, deadline]);

  const title =
    apps.length > 1
      ? `Early Bird deadline passed for ${apps.length} applications`
      : "Early Bird deadline has passed";

  return (
    <Modal isOpen={open} onClose={onCancel} title={title} size="md" persistent>
      <div className="space-y-4 text-sm">
        <div className="flex gap-2 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 p-3">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p className="text-amber-900 dark:text-amber-200 leading-snug">
            Recording payment today is after{" "}
            <span className="font-medium">{deadlineLabel(deadline)}</span>, so the
            discount{apps.length > 1 ? "s" : ""} below would be removed. Only
            mark this paid today if the parent actually paid late.
          </p>
        </div>

        {single ? (
          <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
            <div className="font-medium text-gray-900 dark:text-gray-100">
              {single.studentName}
            </div>
            <div className="mt-1 text-gray-600 dark:text-gray-300">
              {tierLabel(single.detail)} discount &middot; fee changes from{" "}
              <span className="font-medium">
                ${single.detail.discounted_fee.toLocaleString()}
              </span>{" "}
              to{" "}
              <span className="font-medium text-red-600 dark:text-red-400">
                ${single.detail.full_fee.toLocaleString()}
              </span>{" "}
              (${single.detail.amount_at_risk.toLocaleString()} more).
            </div>
          </div>
        ) : (
          <ul className="max-h-52 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
            {apps.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="truncate text-gray-900 dark:text-gray-100">
                  {a.studentName}
                </span>
                <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">
                  {tierLabel(a.detail)} &minus; $
                  {a.detail.amount_at_risk.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Keep-discount path: only offered for a single app, where the admin
            can pin the actual on-time payment date. */}
        {single && onEnterDate && (
          <div className="rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 space-y-2">
            <div className="flex items-center gap-1.5 font-medium text-emerald-900 dark:text-emerald-200">
              <CalendarClock className="h-4 w-4" />
              Parent paid on or before {deadlineLabel(deadline)}?
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={payDate}
                max={deadline ?? undefined}
                onChange={(e) => setPayDate(e.target.value)}
                className="px-2 py-1 rounded border text-sm border-emerald-300 dark:border-emerald-800 bg-white dark:bg-[#1a1a1a]"
              />
              <button
                type="button"
                disabled={busy || !payDate}
                onClick={() => payDate && onEnterDate(payDate)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Keep discount, set this date
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {apps.length > 1 && (
          <p className="mr-auto text-xs text-gray-500 dark:text-gray-400 max-w-[16rem]">
            To keep a discount for someone who paid on time, open their
            application and set the actual payment date.
          </p>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-3 py-1.5 rounded-md text-sm hover:bg-muted disabled:opacity-50"
        >
          {apps.length > 1 ? "Leave unchanged" : "Cancel"}
        </button>
        <button
          type="button"
          onClick={onDropAll}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {apps.length > 1
            ? `Drop discount & mark paid (${apps.length})`
            : "Paid late, drop discount"}
        </button>
      </div>
    </Modal>
  );
}
