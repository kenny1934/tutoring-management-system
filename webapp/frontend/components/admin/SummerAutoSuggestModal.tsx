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
  applicationId?: number | null;
  studentName?: string;
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
  applicationId,
  studentName,
}: SummerAutoSuggestModalProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SummerSuggestResponse | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [accepting, setAccepting] = useState(false);
  const [acceptProgress, setAcceptProgress] = useState({ current: 0, total: 0 });
  const [showAlgorithm, setShowAlgorithm] = useState(false);
  const [adjustingAppId, setAdjustingAppId] = useState<number | null>(null);
  const [adjustMode, setAdjustMode] = useState<"exclude" | "include">("exclude");
  const [adjustDates, setAdjustDates] = useState<string[]>([]);
  const [adjustDateInput, setAdjustDateInput] = useState("");
  const [readjusting, setReadjusting] = useState(false);

  // Run auto-suggest on mount
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setData(null);
    setSelected(new Set());
    setAccepting(false);
    setAcceptProgress({ current: 0, total: 0 });

    summerAPI
      .autoSuggest({ config_id: configId, location, application_id: applicationId ?? undefined })
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
  }, [isOpen, configId, location, applicationId, showToast, onClose]);

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
    // Build bulk items from all selected proposals
    const bulkItems = toPlace.flatMap((p) =>
      p.lesson_assignments.map((a) => ({
        application_id: p.application_id,
        slot_id: a.slot_id,
        lesson_id: a.lesson_id,
      }))
    );

    setAcceptProgress({ current: 0, total: bulkItems.length });

    try {
      const result = await summerAPI.bulkCreateSessions(bulkItems);
      setAcceptProgress({ current: bulkItems.length, total: bulkItems.length });

      if (result.skipped > 0) {
        showToast(
          `Created ${result.created} sessions (${result.skipped} skipped — duplicates or full)`,
          "success"
        );
      } else {
        showToast(
          `Placed ${toPlace.length} student${toPlace.length !== 1 ? "s" : ""} (${result.created} sessions)`,
          "success"
        );
      }
    } catch (e: any) {
      showToast(e.message || "Failed to place students", "error");
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
            {applicationId ? `Suggest for ${studentName || "Student"}` : "Auto-Suggest Placements"}
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

                          {/* Adjust button */}
                          <button
                            className={cn(
                              "shrink-0 p-1.5 rounded-md transition-colors",
                              adjustingAppId === p.application_id
                                ? "text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30"
                                : "text-muted-foreground hover:text-foreground hover:bg-[#e8d4b8]/30 dark:hover:bg-gray-800"
                            )}
                            title="Adjust date constraints"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (adjustingAppId === p.application_id) {
                                setAdjustingAppId(null);
                              } else {
                                setAdjustingAppId(p.application_id);
                                setAdjustDates([]);
                                setAdjustDateInput("");
                                setAdjustMode("exclude");
                              }
                            }}
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Date constraint panel */}
                      {adjustingAppId === p.application_id && (
                        <div className="px-3 pb-3 pt-1 border-t border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 space-y-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setAdjustMode("exclude")}
                              className={cn(
                                "text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors",
                                adjustMode === "exclude"
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                  : "bg-[#e8d4b8]/20 text-muted-foreground hover:bg-[#e8d4b8]/40"
                              )}
                            >
                              Exclude dates
                            </button>
                            <button
                              onClick={() => setAdjustMode("include")}
                              className={cn(
                                "text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors",
                                adjustMode === "include"
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  : "bg-[#e8d4b8]/20 text-muted-foreground hover:bg-[#e8d4b8]/40"
                              )}
                            >
                              Include dates only
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <input
                              type="date"
                              value={adjustDateInput}
                              onChange={(e) => setAdjustDateInput(e.target.value)}
                              className="text-[11px] px-1.5 py-0.5 border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 rounded bg-white dark:bg-gray-800"
                            />
                            <button
                              onClick={() => {
                                if (adjustDateInput && !adjustDates.includes(adjustDateInput)) {
                                  setAdjustDates([...adjustDates, adjustDateInput].sort());
                                  setAdjustDateInput("");
                                }
                              }}
                              disabled={!adjustDateInput}
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40"
                            >
                              Add
                            </button>
                          </div>

                          {adjustDates.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {adjustDates.map((d) => (
                                <span key={d} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[#e8d4b8]/20 dark:bg-[#6b5a4a]/20">
                                  {formatCompactDate(d)}
                                  <button
                                    onClick={() => setAdjustDates(adjustDates.filter((x) => x !== d))}
                                    className="text-muted-foreground hover:text-red-500"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}

                          <button
                            onClick={async () => {
                              setReadjusting(true);
                              try {
                                const result = await summerAPI.autoSuggest({
                                  config_id: configId,
                                  location,
                                  application_id: p.application_id,
                                  exclude_dates: adjustMode === "exclude" ? adjustDates : undefined,
                                  include_dates: adjustMode === "include" ? adjustDates : undefined,
                                });
                                if (result.proposals.length > 0 && data) {
                                  // Replace the proposal for this student
                                  const updated = data.proposals.map((existing) =>
                                    existing.application_id === p.application_id
                                      ? result.proposals[0]
                                      : existing
                                  );
                                  setData({ ...data, proposals: updated });
                                  showToast("Re-suggested with date constraints", "success");
                                } else {
                                  showToast("No placement found with these constraints", "error");
                                }
                              } catch (e: any) {
                                showToast(e.message || "Re-suggest failed", "error");
                              } finally {
                                setReadjusting(false);
                                setAdjustingAppId(null);
                              }
                            }}
                            disabled={adjustDates.length === 0 || readjusting}
                            className="text-[10px] font-medium px-2.5 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            {readjusting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                            Re-suggest
                          </button>
                        </div>
                      )}
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
