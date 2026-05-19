"use client";

import { useEffect, useState } from "react";
import { X, CalendarClock, Sparkles, AlertCircle } from "lucide-react";
import { makeupSuggestions } from "@/lib/mock-data/sessions";
import type { ClassSession, Student } from "@/lib/types";

type Props = {
  student: Student;
  session: ClassSession | null;
  fromSessionId: string;
  onClose: () => void;
  onConfirm: () => void;
};

export function MakeupModal({ student, session, onClose, onConfirm }: Props) {
  const [chosenId, setChosenId] = useState<string | null>(
    makeupSuggestions[0]?.id ?? null
  );
  const [reason, setReason] = useState("");

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-ink-900/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="surface w-full sm:max-w-2xl bg-white max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-amber-600" />
              <span className="text-lg font-semibold text-ink-900">
                Schedule makeup
              </span>
            </div>
            <div className="text-xs text-ink-500 mt-0.5">
              For {student.name} ({student.code}) ·{" "}
              {session && (
                <>
                  Missed {session.className} on{" "}
                  {new Date(session.startAt).toLocaleDateString("en-HK", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 -mr-2 p-2"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-ink-500 mb-1">
              Reason
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Sick / family / typhoon / other"
              className="w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-accent-600" />
              <span className="text-xs uppercase tracking-wide text-ink-500 font-medium">
                Suggested slots
              </span>
            </div>
            <div className="space-y-2">
              {makeupSuggestions.map((s) => {
                const isChosen = chosenId === s.id;
                const tone =
                  s.fit === "best"
                    ? "border-emerald-200 bg-emerald-50"
                    : s.fit === "good"
                      ? "border-amber-200 bg-amber-50"
                      : "border-rose-200 bg-rose-50";
                return (
                  <button
                    key={s.id}
                    onClick={() => setChosenId(s.id)}
                    className={`w-full text-left rounded-md border p-3 ${
                      isChosen
                        ? "ring-2 ring-accent-300 border-accent-300 bg-white"
                        : tone
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-ink-900 text-sm">
                        {s.day} · {s.time}
                      </div>
                      <span
                        className={`text-xs rounded-md px-2 py-0.5 ${
                          s.fit === "best"
                            ? "bg-emerald-200 text-emerald-800"
                            : s.fit === "good"
                              ? "bg-amber-200 text-amber-800"
                              : "bg-rose-200 text-rose-800"
                        }`}
                      >
                        {s.fit} fit
                      </span>
                    </div>
                    <div className="text-xs text-ink-600 mt-1">{s.rationale}</div>
                    <div className="text-xs text-ink-400 mt-0.5 font-mono">
                      {s.classCode}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-ink-500 mt-2 flex items-start gap-1.5">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              Smart suggestions consider tutor pairing, class capacity, and
              the student's usual availability window.
            </p>
          </div>
        </div>

        <footer className="border-t border-ink-200 px-5 py-3 bg-ink-50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-ink-300 text-ink-700 px-3 py-1.5 text-sm hover:bg-white"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!chosenId}
            className="rounded-md bg-accent-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Schedule makeup
          </button>
        </footer>
      </div>
    </div>
  );
}
