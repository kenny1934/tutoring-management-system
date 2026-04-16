"use client";

import React, { useState } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { summerAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";

// Inline editor for a summer application's paid_at timestamp. Shown on
// applications whose status is Paid/Enrolled, where the stamp drives the
// discount-tier deadline check. Admins correct it when the recorded date
// differs from the actual payment date (e.g. bank transfer received before
// the deadline but marked Paid after).

interface Props {
  applicationId: number;
  paidAt: string | null | undefined;
  readOnly?: boolean;
  onSaved?: () => void;
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function PaidAtEditor({ applicationId, paidAt, readOnly, onSaved }: Props) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toDateInput(paidAt));
  const [saving, setSaving] = useState(false);

  const current = toDateInput(paidAt);

  async function handleSave() {
    if (draft === current) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      // Send midnight HK time as an ISO datetime so the backend stores a
      // consistent DATETIME (the column is DATETIME, not DATE).
      const iso = draft ? `${draft}T00:00:00` : null;
      await summerAPI.updateApplication(applicationId, { paid_at: iso });
      showToast("Payment date updated", "success");
      setEditing(false);
      onSaved?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to update", "error");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(current);
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Paid on</span>
      {editing ? (
        <>
          <input
            type="date"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={cn(
              "px-1.5 py-0.5 rounded border text-xs",
              "border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a]",
            )}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-50"
          >
            <X className="h-3 w-3" />
          </button>
        </>
      ) : (
        <>
          <span className="font-medium">{current || "not set"}</span>
          {!readOnly && (
            <button
              type="button"
              onClick={() => {
                setDraft(current);
                setEditing(true);
              }}
              className="text-muted-foreground hover:text-foreground"
              title="Edit recorded payment date"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
