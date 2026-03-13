"use client";

import { useState, useEffect } from "react";
import { Wand2, Loader2, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { summerAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import type { SummerSuggestionItem, SummerSuggestResponse } from "@/types";

interface SummerAutoSuggestModalProps {
  isOpen: boolean;
  onClose: () => void;
  configId: number;
  location: string;
  onAccepted: () => void;
}

const MATCH_COLORS: Record<string, { bg: string; text: string }> = {
  first_pref: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300" },
  second_pref: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300" },
  any_open: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400" },
};

const MATCH_LABELS: Record<string, string> = {
  first_pref: "1st pref",
  second_pref: "2nd pref",
  any_open: "Any slot",
};

export function SummerAutoSuggestModal({
  isOpen,
  onClose,
  configId,
  location,
  onAccepted,
}: SummerAutoSuggestModalProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SummerSuggestResponse | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [accepting, setAccepting] = useState(false);

  // Run auto-suggest on mount
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    summerAPI
      .autoSuggest({ config_id: configId, location })
      .then((result) => {
        setData(result);
        // Default: select all proposals with confidence > 0.5
        const defaultSelected = new Set(
          result.proposals
            .filter((p) => p.confidence > 0.5)
            .map((p) => p.application_id)
        );
        setSelected(defaultSelected);
      })
      .catch((e) => {
        showToast(e.message || "Auto-suggest failed", "error");
        onClose();
      })
      .finally(() => setLoading(false));
  }, [isOpen, configId, location, showToast, onClose]);

  const toggleItem = (appId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  };

  const toggleAll = () => {
    if (!data) return;
    if (selected.size === data.proposals.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.proposals.map((p) => p.application_id)));
    }
  };

  const handleAccept = async () => {
    if (!data) return;
    const toPlace = data.proposals.filter((p) => selected.has(p.application_id));
    if (toPlace.length === 0) return;

    setAccepting(true);
    let successCount = 0;
    let failCount = 0;

    for (const proposal of toPlace) {
      try {
        await summerAPI.createPlacement({
          application_id: proposal.application_id,
          slot_id: proposal.slot_id,
        });
        successCount++;
      } catch {
        failCount++;
      }
    }

    if (failCount > 0) {
      showToast(`Placed ${successCount}, failed ${failCount}`, "error");
    } else {
      showToast(`Placed ${successCount} students`, "success");
    }

    setAccepting(false);
    onAccepted();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <Wand2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <h2 className="text-base font-semibold flex-1">Auto-Suggest Placements</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              <p className="text-sm text-muted-foreground">Running algorithm...</p>
            </div>
          ) : !data || data.proposals.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">No placements could be suggested.</p>
              {data && data.unplaceable.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {data.unplaceable.length} student(s) could not be placed.
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Select all */}
              <div className="flex items-center gap-2 mb-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.size === data.proposals.length}
                    onChange={toggleAll}
                    className="rounded"
                  />
                  Select all ({data.proposals.length})
                </label>
                <span className="text-xs text-muted-foreground ml-auto">
                  {selected.size} selected
                </span>
              </div>

              {/* Proposals table */}
              <div className="space-y-1">
                {data.proposals.map((p) => (
                  <label
                    key={p.application_id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                      selected.has(p.application_id)
                        ? "bg-amber-50 dark:bg-amber-900/20"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(p.application_id)}
                      onChange={() => toggleItem(p.application_id)}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{p.student_name}</span>
                        <span className="text-[10px] font-bold px-1 rounded bg-gray-100 dark:bg-gray-700">
                          {p.student_grade}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        → {p.slot_day} {p.slot_time}
                        {p.slot_grade && ` (${p.slot_grade})`}
                        {p.slot_label && ` ${p.slot_label}`}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                        MATCH_COLORS[p.match_type]?.bg,
                        MATCH_COLORS[p.match_type]?.text
                      )}
                    >
                      {MATCH_LABELS[p.match_type] || p.match_type}
                    </span>
                  </label>
                ))}
              </div>

              {/* Unplaceable */}
              {data.unplaceable.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-1.5 text-sm text-orange-600 dark:text-orange-400 mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    Could not place ({data.unplaceable.length})
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {data.unplaceable.map((u) => (
                      <div key={u.application_id}>
                        {u.student_name}: {u.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {data && data.proposals.length > 0 && (
          <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAccept}
              disabled={selected.size === 0 || accepting}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {accepting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Accept {selected.size} placement{selected.size !== 1 ? "s" : ""}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
