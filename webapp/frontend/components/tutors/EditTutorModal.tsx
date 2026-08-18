"use client";

import { useState, useEffect } from "react";
import { mutate } from "swr";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useLocations } from "@/lib/hooks";
import { tutorsAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import {
  COVERAGE_WEEKDAYS,
  EMPTY_DRAFT,
  coverageDraftLabel,
  coverageDraftProblem,
  coverageDraftsFromRows,
  coverageRowsFromDrafts,
  normaliseLocation,
  type CoverageDraft,
} from "@/lib/employment";
import type { Tutor, TutorUpdate } from "@/types";

interface EditTutorModalProps {
  tutor: Tutor;
  isOpen: boolean;
  onClose: () => void;
  /** Called with the freshly-updated tutor so the parent can refresh its view. */
  onSaved?: (updated: Tutor) => void;
}

export function EditTutorModal({ tutor, isOpen, onClose, onSaved }: EditTutorModalProps) {
  const { data: locations } = useLocations();
  const { showToast } = useToast();

  const [nickname, setNickname] = useState("");
  const [defaultLocation, setDefaultLocation] = useState("");
  const [basicSalary, setBasicSalary] = useState("");
  const [isActiveTutor, setIsActiveTutor] = useState(true);
  const [departureOn, setDepartureOn] = useState("");
  // Keyed by branch code. A branch with no entry is not covered at all, which
  // is the same thing the checkbox says.
  const [coverage, setCoverage] = useState<Record<string, CoverageDraft>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Teaching staff are the ones ARK keeps records for, so their leaving date
  // arrives from the nightly sync and editing it here would be undone. The
  // Supervisor and Guest accounts exist only in CSM, so theirs is set by hand.
  // Same rule as tutors_missing_from_ark on the backend.
  const arkManaged = tutor.is_active_tutor !== false;

  // Reset form whenever a new tutor is opened.
  useEffect(() => {
    if (!isOpen) return;
    setNickname(tutor.nickname ?? "");
    setDefaultLocation(tutor.default_location ?? "");
    setBasicSalary(
      tutor.basic_salary !== undefined && tutor.basic_salary !== null
        ? String(tutor.basic_salary)
        : ""
    );
    setIsActiveTutor(tutor.is_active_tutor ?? true);
    setDepartureOn(tutor.departure_effective_on ?? "");
    setCoverage(coverageDraftsFromRows(tutor.branch_coverage));
  }, [isOpen, tutor]);

  // Build the location options, making sure the tutor's current value is present
  // even if it isn't in the active-locations list.
  const locationOptions = (() => {
    // Exclude the "All Locations" sentinel and the "Various" placeholder, matching
    // how locations are filtered elsewhere (e.g. the sidebar selector).
    const opts = [...(locations ?? [])].filter(
      (l) => l && l !== "All Locations" && l !== "Various"
    );
    if (tutor.default_location && !opts.includes(tutor.default_location)) {
      opts.unshift(tutor.default_location);
    }
    return opts;
  })();

  // The branches somebody could be sent to cover, which is every branch except
  // the one they already belong to.
  const coverableLocations = locationOptions.filter(
    (loc) => normaliseLocation(loc) !== normaliseLocation(defaultLocation)
  );

  const branchKey = (loc: string) => normaliseLocation(loc) ?? loc;
  const draftFor = (loc: string): CoverageDraft | undefined => coverage[branchKey(loc)];

  // Ticking starts an arrangement with nothing set, which reads as "also works
  // there, any day, indefinitely". That is what almost every cover turns out to
  // be, so the days and dates below are there to narrow it, never to make it
  // work in the first place. Unticking drops the whole arrangement.
  const toggleCoverage = (loc: string) => {
    const key = branchKey(loc);
    setCoverage((drafts) => {
      const next = { ...drafts };
      if (next[key]) delete next[key];
      else next[key] = { ...EMPTY_DRAFT };
      return next;
    });
  };

  const editDraft = (loc: string, change: Partial<CoverageDraft>) => {
    const key = branchKey(loc);
    setCoverage((drafts) =>
      drafts[key] ? { ...drafts, [key]: { ...drafts[key], ...change } } : drafts
    );
  };

  // Turning a day on or off. No day chosen at all means every day, so there is
  // deliberately no "any day" button to press: it is what you get by leaving
  // them alone, and the hint under the row says so.
  const toggleWeekday = (loc: string, day: string) => {
    const draft = draftFor(loc);
    if (!draft) return;
    editDraft(loc, {
      weekdays: draft.weekdays.includes(day)
        ? draft.weekdays.filter((d) => d !== day)
        : COVERAGE_WEEKDAYS.filter((d) => d === day || draft.weekdays.includes(d)),
    });
  };

  // Every arrangement has to make sense before any of it is saved, since one
  // bad date would otherwise be written alongside the good ones.
  const coverageProblems = Object.entries(coverage)
    .map(([branch, draft]) => ({ branch, problem: coverageDraftProblem(draft) }))
    .filter((entry) => entry.problem);

  const handleSave = async () => {
    if (coverageProblems.length > 0) {
      const { branch, problem } = coverageProblems[0];
      showToast(`${branch}: ${problem}`, "error");
      return;
    }

    // Salary must be a non-negative number when provided.
    let salaryValue: number | undefined;
    if (basicSalary.trim() !== "") {
      const parsed = Number(basicSalary);
      if (Number.isNaN(parsed) || parsed < 0) {
        showToast("Basic salary must be a non-negative number", "error");
        return;
      }
      salaryValue = parsed;
    }

    // Send text fields explicitly (empty string clears them); omit salary when
    // left blank so a blank field never silently zeroes existing pay.
    const payload: TutorUpdate = {
      nickname: nickname.trim(),
      default_location: defaultLocation,
      basic_salary: salaryValue,
      is_active_tutor: isActiveTutor,
      // Null clears it, which is what a withdrawn resignation needs.
      departure_effective_on: departureOn.trim() === "" ? null : departureOn,
      // The whole list every time. The server replaces what it holds, so an
      // empty list is how a finished cover is cleared.
      branch_coverage: coverageRowsFromDrafts(coverage),
    };

    setIsSaving(true);
    try {
      const updated = await tutorsAPI.update(tutor.id, payload);
      // Every tutor picker in the app reads the shared roster, and covering
      // another branch is the sort of edit somebody makes on their way to
      // assigning a lesson. Waiting out the browser's five-minute cache would
      // look exactly like the tick not having worked, so force it now.
      await mutate("tutors", () => tutorsAPI.getAll({ fresh: true }));
      showToast("Tutor updated", "success");
      onSaved?.(updated);
      onClose();
    } catch {
      showToast("Failed to update tutor", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit ${tutor.tutor_name}`}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Nickname */}
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">
            Nickname
          </label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="e.g. David Sir, Miss Bella"
            className="w-full px-3 py-2 text-sm rounded-lg border border-foreground/15 bg-[#f0e8dc] dark:bg-[#231d14] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="mt-1 text-xs text-foreground/50">
            Short name used in parent messages.
          </p>
        </div>

        {/* Default location */}
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">
            Default location
          </label>
          <select
            value={defaultLocation}
            onChange={(e) => setDefaultLocation(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-foreground/15 bg-[#f0e8dc] dark:bg-[#231d14] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">— None —</option>
            {locationOptions.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>

        {/* Also covers. Sits under the default location because it only makes
            sense next to it: this is the list of other branches somebody can be
            put on a lesson at, which is what happens when they go and cover for
            a colleague. It does not make them assignable to a regular enrolment
            or a duty roster there. */}
        {coverableLocations.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Also covers
            </label>
            <div className="space-y-3">
              {coverableLocations.map((loc) => {
                const draft = draftFor(loc);
                const problem = draft ? coverageDraftProblem(draft) : null;
                return (
                  <div key={loc}>
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={Boolean(draft)}
                        onChange={() => toggleCoverage(loc)}
                        className="h-4 w-4 rounded border-foreground/30 text-primary focus:ring-primary/30"
                      />
                      <span className="text-sm text-foreground/80">{loc}</span>
                    </label>

                    {/* The days and dates only exist once the branch is ticked,
                        because there is nothing to narrow until then. */}
                    {draft && (
                      <div className="mt-2 ml-7 space-y-2 border-l-2 border-foreground/10 pl-3">
                        <div>
                          <div className="flex flex-wrap gap-1">
                            {COVERAGE_WEEKDAYS.map((day) => {
                              const on = draft.weekdays.includes(day);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => toggleWeekday(loc, day)}
                                  aria-pressed={on}
                                  className={cn(
                                    "px-2 py-1 text-xs rounded-md border transition-colors",
                                    on
                                      ? "border-primary bg-primary/10 text-foreground font-medium"
                                      : "border-foreground/15 text-foreground/60 hover:bg-foreground/5"
                                  )}
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                          <p className="mt-1 text-xs text-foreground/50">
                            Leave every day unpicked when they cover on whatever
                            day comes up.
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <label className="text-xs text-foreground/60">
                            <span className="block mb-1">First day</span>
                            <input
                              type="date"
                              value={draft.from}
                              onChange={(e) => editDraft(loc, { from: e.target.value })}
                              className="px-2 py-1 text-sm rounded-lg border border-foreground/15 bg-[#f0e8dc] dark:bg-[#231d14] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </label>
                          <label className="text-xs text-foreground/60">
                            <span className="block mb-1">Last day</span>
                            <input
                              type="date"
                              value={draft.until}
                              onChange={(e) => editDraft(loc, { until: e.target.value })}
                              className="px-2 py-1 text-sm rounded-lg border border-foreground/15 bg-[#f0e8dc] dark:bg-[#231d14] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </label>
                        </div>

                        {problem ? (
                          <p className="text-xs text-rose-600 dark:text-rose-400">{problem}</p>
                        ) : (
                          <p className="text-xs text-foreground/60">
                            {/* The arrangement read back as a sentence, so
                                nobody has to work out what an empty field
                                means. A blank form is a real answer, and it is
                                the one worth spelling out. */}
                            Covers {coverageDraftLabel(loc, draft)}
                            {draft.weekdays.length === 0 && !draft.from && !draft.until
                              && " (any day, no end date)"}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-foreground/50">
              They appear in that branch&rsquo;s session and make-up pickers,
              under their own name and marked with their home branch. Leave both
              dates empty for an arrangement with no end, and untick the branch
              when the cover is over.
            </p>
          </div>
        )}

        {/* Basic salary */}
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">
            Basic salary (monthly)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground/50">
              $
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={basicSalary}
              onChange={(e) => setBasicSalary(e.target.value)}
              placeholder="0.00"
              className="w-full pl-7 pr-3 py-2 text-sm rounded-lg border border-foreground/15 bg-[#f0e8dc] dark:bg-[#231d14] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <p className="mt-1 text-xs text-foreground/50">
            Base pay before session revenue and bonus.
          </p>
        </div>

        {/* Active tutor toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isActiveTutor}
            onChange={(e) => setIsActiveTutor(e.target.checked)}
            className="h-4 w-4 rounded border-foreground/30 text-primary focus:ring-primary/30"
          />
          <span className="text-sm font-medium text-foreground/80">
            Active tutor (teaches students)
          </span>
        </label>

        {/* Last working day. Separate from the toggle above because they answer
            different questions: a Supervisor does not teach and is not leaving,
            and a tutor on notice teaches right up to the date below. */}
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">
            Last working day
          </label>
          <input
            type="date"
            value={departureOn}
            onChange={(e) => setDepartureOn(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
          />
          <p className="mt-1 text-xs text-foreground/60">
            {arkManaged
              ? "This comes from ARK and the nightly sync will put it back if you change it here. Record the resignation in ARK instead."
              : "Leave blank unless they are leaving. From the day after this date they cannot log in, they drop out of the tutor pickers, and no lesson can be booked for them."}
          </p>
        </div>
      </div>
    </Modal>
  );
}
