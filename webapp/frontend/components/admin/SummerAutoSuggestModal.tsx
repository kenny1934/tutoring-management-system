"use client";

import { useState, useEffect } from "react";
import {
  Wand2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronRight,
  Info,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { summerAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { SUMMER_GRADE_BG, SUMMER_GRADE_BORDER, formatCompactDate } from "@/lib/summer-utils";
import type { SummerSuggestionItem, SummerSuggestResponse } from "@/types";

interface SummerAutoSuggestModalProps {
  isOpen: boolean;
  onClose: () => void;
  configId: number;
  location: string;
  onAccepted: () => void;
}

const MATCH_COLORS: Record<string, { bg: string; text: string }> = {
  first_pref: {
    bg: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-700 dark:text-green-300",
  },
  second_pref: {
    bg: "bg-yellow-100 dark:bg-yellow-900/30",
    text: "text-yellow-700 dark:text-yellow-300",
  },
  any_open: {
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-600 dark:text-gray-400",
  },
};

const MATCH_LABELS: Record<string, string> = {
  first_pref: "1st pref",
  second_pref: "2nd pref",
  any_open: "Any slot",
};

function SequenceScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    score > 0.8
      ? "bg-green-500"
      : score >= 0.5
        ? "bg-yellow-500"
        : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

function LessonRow({ assignments }: { assignments: SummerSuggestionItem["lesson_assignments"] }) {
  return (
    <div className="flex gap-0.5 mt-1.5">
      {assignments.map((a) => (
        <div
          key={a.lesson_id}
          className="flex-1 min-w-0 text-center px-0.5 py-1 rounded bg-[#fef9f3] dark:bg-[#2d2618] border border-[#e8d4b8]/50"
        >
          <div className="text-[9px] font-semibold text-foreground/70">
            L{a.lesson_number}
          </div>
          <div className="text-[9px] text-muted-foreground truncate">
            {formatCompactDate(a.lesson_date)}
          </div>
        </div>
      ))}
    </div>
  );
}

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
  const [acceptProgress, setAcceptProgress] = useState({ current: 0, total: 0 });
  const [showAlgorithm, setShowAlgorithm] = useState(false);

  // Run auto-suggest on mount
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setData(null);
    setSelected(new Set());
    setAccepting(false);
    setAcceptProgress({ current: 0, total: 0 });

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

    // Total lesson assignments to create
    const totalCalls = toPlace.reduce(
      (sum, p) => sum + p.lesson_assignments.length,
      0
    );
    setAcceptProgress({ current: 0, total: totalCalls });

    let currentCall = 0;
    for (const proposal of toPlace) {
      let studentFailed = false;
      for (const assignment of proposal.lesson_assignments) {
        try {
          await summerAPI.createSession({
            application_id: proposal.application_id,
            slot_id: assignment.slot_id,
            lesson_id: assignment.lesson_id,
            mode: "single",
          });
        } catch {
          studentFailed = true;
        }
        currentCall++;
        setAcceptProgress({ current: currentCall, total: totalCalls });
      }
      if (studentFailed) {
        failCount++;
      } else {
        successCount++;
      }
    }

    if (failCount > 0) {
      showToast(`Placed ${successCount}, failed ${failCount}`, "error");
    } else {
      showToast(`Placed ${successCount} student${successCount !== 1 ? "s" : ""}`, "success");
    }

    setAccepting(false);
    onAccepted();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 md:left-[var(--sidebar-width,72px)] z-50 flex items-center justify-center p-4 transition-[left] duration-350">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#1a1a1a] border-2 border-[#e8d4b8] rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e8d4b8] bg-[#fef9f3] dark:bg-[#2d2618] rounded-t-xl">
          <Wand2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <h2 className="text-base font-semibold flex-1">
            Auto-Suggest Placements
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Algorithm explanation — collapsible */}
          <button
            onClick={() => setShowAlgorithm(!showAlgorithm)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
          >
            {showAlgorithm ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>How does auto-suggest work?</span>
          </button>
          {showAlgorithm && (
            <div className="text-xs text-muted-foreground bg-[#fef9f3] dark:bg-[#2d2618] border border-[#e8d4b8]/50 rounded-lg p-3 space-y-1.5">
              <p>
                The algorithm finds optimal lesson-level placements for unassigned students:
              </p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>
                  Matches student grade and preferred day/time to available slots
                </li>
                <li>
                  For each candidate slot, assigns all 8 lessons (L1-L8) to specific dates
                </li>
                <li>
                  Computes a <strong>sequence score</strong> measuring how well the
                  assigned lesson numbers align with what the class is teaching on
                  each date
                </li>
                <li>
                  For 2x/week students, finds the best pair of slots whose
                  interleaved dates produce optimal lesson alignment
                </li>
                <li>
                  Ranks proposals by preference match, sequence alignment, and
                  available capacity
                </li>
              </ul>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-muted-foreground">
                Running algorithm...
              </p>
            </div>
          ) : !data || data.proposals.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">
                No placements could be suggested.
              </p>
              {data && data.unplaceable.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {data.unplaceable.length} student(s) could not be placed.
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Select all */}
              <div className="flex items-center gap-2">
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

              {/* Proposal cards */}
              <div className="space-y-2">
                {data.proposals.map((p) => {
                  const gradeBg =
                    SUMMER_GRADE_BG[p.student_grade] ||
                    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
                  const gradeBorder =
                    SUMMER_GRADE_BORDER[p.student_grade] ||
                    "border-l-gray-400";

                  return (
                    <div
                      key={p.application_id}
                      className={cn(
                        "rounded-lg border-2 border-l-4 transition-colors",
                        gradeBorder,
                        selected.has(p.application_id)
                          ? "border-[#e8d4b8] bg-[#fef9f3]/50 dark:bg-[#2d2618]/50"
                          : "border-gray-200 dark:border-gray-700 hover:border-[#e8d4b8]/60"
                      )}
                    >
                      <div className="px-3 py-2.5">
                        {/* Top row: checkbox + student info + badges + score */}
                        <div className="flex items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={selected.has(p.application_id)}
                            onChange={() => toggleItem(p.application_id)}
                            className="rounded mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate">
                                {p.student_name}
                              </span>
                              <span
                                className={cn(
                                  "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                  gradeBg
                                )}
                              >
                                {p.student_grade}
                              </span>
                              {p.sessions_per_week > 1 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                  {p.sessions_per_week}x
                                </span>
                              )}
                              <span
                                className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                                  MATCH_COLORS[p.match_type]?.bg ||
                                    "bg-gray-100 dark:bg-gray-800",
                                  MATCH_COLORS[p.match_type]?.text ||
                                    "text-gray-600 dark:text-gray-400"
                                )}
                              >
                                {MATCH_LABELS[p.match_type] || p.match_type}
                              </span>
                            </div>

                            {/* Sequence score bar */}
                            <div className="mt-1">
                              <SequenceScoreBar score={p.sequence_score} />
                            </div>

                            {/* 8-cell lesson row */}
                            <LessonRow assignments={p.lesson_assignments} />

                            {/* Match reason */}
                            <div className="text-[11px] text-muted-foreground mt-1.5">
                              {p.reason}
                            </div>

                            {/* Unavailability warning */}
                            {p.unavailability_notes && (
                              <div className="flex items-start gap-1 mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                                <span>{p.unavailability_notes}</span>
                              </div>
                            )}
                          </div>

                          {/* Adjust button (placeholder) */}
                          <button
                            className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            title="Adjust date constraints"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Placeholder — full implementation later
                            }}
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Unplaceable */}
              {data.unplaceable.length > 0 && (
                <div className="pt-4 border-t border-[#e8d4b8]/50">
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
          <div className="flex items-center gap-3 px-5 py-4 border-t border-[#e8d4b8] bg-[#fef9f3] dark:bg-[#2d2618] rounded-b-xl">
            {accepting && acceptProgress.total > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>
                  {acceptProgress.current}/{acceptProgress.total} lessons
                </span>
              </div>
            )}
            <button
              onClick={onClose}
              disabled={accepting}
              className="px-4 py-2 text-sm rounded-lg border border-[#e8d4b8] hover:bg-[#fef9f3] dark:hover:bg-[#2d2618] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAccept}
              disabled={selected.size === 0 || accepting}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
