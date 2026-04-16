"use client";

import React, { useState } from "react";
import { Shield, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { enrollmentsAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import type { SummerPricingConfig } from "@/types";

// Admin UI for pinning a specific discount tier on a published Summer
// enrollment. Used when a parent actually paid before the deadline but the
// admin recorded it late — the auto-downgrade would strip their discount.
// The override short-circuits the nightly sweep and carries an audit trail
// (who, when, why).

interface Props {
  enrollmentId: number;
  config: SummerPricingConfig | null | undefined;
  currentOverrideCode: string | null | undefined;
  onChanged: () => void;
}

export function DiscountOverrideControls({
  enrollmentId,
  config,
  currentOverrideCode,
  onChanged,
}: Props) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(currentOverrideCode ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const tierOptions = [
    { code: "NONE", label: "No discount" },
    ...(config?.discounts ?? []).map((d) => ({
      code: d.code,
      label: `${d.name_zh || d.name_en} (${d.code}) − $${d.amount}`,
    })),
  ];

  async function handleSave() {
    if (!code || !reason.trim()) {
      showToast("Pick a tier and enter a reason", "error");
      return;
    }
    setSaving(true);
    try {
      await enrollmentsAPI.setDiscountOverride(enrollmentId, {
        code,
        reason: reason.trim(),
      });
      showToast("Tier override saved", "success");
      setOpen(false);
      setReason("");
      onChanged();
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Failed to save override",
        "error",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      await enrollmentsAPI.clearDiscountOverride(enrollmentId);
      showToast("Override cleared. Auto-tier restored.", "success");
      onChanged();
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Failed to clear override",
        "error",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2 text-xs">
      {!open ? (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded",
              "text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30",
            )}
          >
            <Shield className="h-3 w-3" />
            {currentOverrideCode ? "Edit override" : "Override tier"}
          </button>
          {currentOverrideCode && (
            <button
              type="button"
              onClick={handleClear}
              disabled={saving}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
              Clear override
            </button>
          )}
        </>
      ) : (
        <div className="w-full p-3 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
              Override discount tier
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <label className="block text-xs font-medium">
            Tier
            <select
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-0.5 w-full px-2 py-1 rounded border text-sm bg-white dark:bg-[#1a1a1a]"
            >
              <option value="">Select tier…</option>
              {tierOptions.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium">
            Reason (required for audit)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Parent transferred Jun 14; bank receipt on file"
              className="mt-0.5 w-full px-2 py-1 rounded border text-sm bg-white dark:bg-[#1a1a1a]"
            />
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2 py-1 text-xs rounded hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Save override
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
