"use client";

import { useState, useEffect, useMemo } from "react";
import { Users2, Loader2, Save, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { summerAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { DAY_ABBREV, LOCATION_TO_CODE, displayLocation } from "@/lib/summer-utils";
import useSWR from "swr";
import type { SummerTutorDutyItem } from "@/types";

interface SummerTutorDutyModalProps {
  isOpen: boolean;
  onClose: () => void;
  configId: number;
  location: string;
  days: string[];
  timeSlots: string[];
  onSaved: () => void;
}


export function SummerTutorDutyModal({
  isOpen,
  onClose,
  configId,
  location,
  days,
  timeSlots,
  onSaved,
}: SummerTutorDutyModalProps) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  // Set of "tutorId|day|timeSlot" keys
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Fetch active tutors
  const { data: allTutors } = useSWR(
    isOpen ? "summer-active-tutors" : null,
    () => summerAPI.getActiveTutors()
  );

  // Filter tutors by selected location
  const locationCode = LOCATION_TO_CODE[location];
  const tutors = useMemo(
    () => allTutors?.filter((t) => t.default_location === locationCode),
    [allTutors, locationCode]
  );

  // Fetch existing duties
  const { data: duties } = useSWR(
    isOpen ? ["summer-duties", configId, location] : null,
    () => summerAPI.getTutorDuties(configId, location)
  );

  // Initialize checked set from existing duties
  useEffect(() => {
    if (duties && !initialized) {
      const keys = new Set(
        duties.map((d) => `${d.tutor_id}|${d.duty_day}|${d.time_slot}`)
      );
      setChecked(keys);
      setInitialized(true);
    }
  }, [duties, initialized]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setInitialized(false);
    }
  }, [isOpen]);

  const toggle = (tutorId: number, day: string, ts: string) => {
    const key = `${tutorId}|${day}|${ts}`;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleTutorRow = (tutorId: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      const allKeys = days.flatMap((d) =>
        timeSlots.map((ts) => `${tutorId}|${d}|${ts}`)
      );
      const allChecked = allKeys.every((k) => next.has(k));
      for (const k of allKeys) {
        if (allChecked) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const toggleColumn = (day: string, ts: string) => {
    if (!tutors) return;
    setChecked((prev) => {
      const next = new Set(prev);
      const keys = tutors.map((t) => `${t.id}|${day}|${ts}`);
      const allChecked = keys.every((k) => next.has(k));
      for (const k of keys) {
        if (allChecked) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const dutyItems: SummerTutorDutyItem[] = [];
      for (const key of checked) {
        const [tutorId, day, ts] = key.split("|");
        dutyItems.push({
          tutor_id: parseInt(tutorId),
          duty_day: day,
          time_slot: ts,
        });
      }
      await summerAPI.bulkSetTutorDuties({
        config_id: configId,
        location,
        duties: dutyItems,
      });
      showToast(`Saved ${dutyItems.length} duties`, "success");
      onSaved();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  // Columns: grouped by day, each day has its time slots
  const columns = useMemo(
    () => days.flatMap((d) => timeSlots.map((ts) => ({ day: d, ts }))),
    [days, timeSlots]
  );

  if (!isOpen) return null;

  const loading = !tutors || !duties;

  return (
    <div className="fixed inset-0 md:left-[var(--sidebar-width,72px)] z-50 flex items-center justify-center p-4 transition-[left] duration-350">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl md:max-w-4xl lg:max-w-5xl max-h-[85vh] flex flex-col border border-border">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Users2 className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold flex-1">
            Tutor Duties — {displayLocation(location)}
          </h2>
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
            {checked.size} duties
          </span>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          ) : tutors.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No active tutors found for {displayLocation(location)}.
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  {/* Day header row */}
                  <tr className="bg-secondary">
                    <th className="sticky left-0 z-10 bg-secondary text-left px-3 py-2 border-b border-border" />
                    {days.map((day) => (
                      <th
                        key={day}
                        colSpan={timeSlots.length}
                        className="text-center px-1 py-2 font-semibold text-foreground border-b border-border border-l-2 border-l-primary/15"
                      >
                        {DAY_ABBREV[day] || day}
                      </th>
                    ))}
                  </tr>
                  {/* Time slot header row */}
                  <tr className="bg-secondary/50">
                    <th className="sticky left-0 z-10 bg-secondary/50 text-left px-3 py-1.5 border-b border-border font-medium text-muted-foreground">
                      Tutor
                    </th>
                    {columns.map(({ day, ts }, i) => (
                      <th
                        key={`${day}-${ts}`}
                        className={cn(
                          "text-center px-2 py-1.5 font-normal text-muted-foreground border-b border-border border-r border-border/30 cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors",
                          i % timeSlots.length === 0 &&
                            "border-l-2 border-l-primary/15"
                        )}
                        onClick={() => toggleColumn(day, ts)}
                        title={`Toggle all tutors for ${DAY_ABBREV[day] || day} ${ts}`}
                      >
                        {ts}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tutors.map((tutor, rowIdx) => (
                    <tr
                      key={tutor.id}
                      className={cn(
                        rowIdx % 2 === 1 && "bg-secondary/20"
                      )}
                    >
                      <td
                        className={cn(
                          "sticky left-0 z-10 px-3 py-2 font-medium text-foreground border-b border-border/50 border-r border-border/30 whitespace-nowrap cursor-pointer hover:text-primary transition-colors",
                          rowIdx % 2 === 1 ? "bg-secondary/20" : "bg-card dark:bg-gray-900"
                        )}
                        onClick={() => toggleTutorRow(tutor.id)}
                        title="Toggle entire row"
                      >
                        {tutor.tutor_name}
                      </td>
                      {columns.map(({ day, ts }, i) => {
                        const key = `${tutor.id}|${day}|${ts}`;
                        const isChecked = checked.has(key);
                        return (
                          <td
                            key={key}
                            className={cn(
                              "text-center px-2 py-2 border-b border-border/50 border-r border-border/30 cursor-pointer transition-colors",
                              i % timeSlots.length === 0 &&
                                "border-l-2 border-l-primary/15",
                              isChecked
                                ? "bg-primary/20 hover:bg-primary/30"
                                : "hover:bg-primary/8"
                            )}
                            onClick={() => toggle(tutor.id, day, ts)}
                          >
                            {isChecked && (
                              <Check className="h-3.5 w-3.5 text-primary mx-auto" strokeWidth={3} />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Duties
          </button>
        </div>
      </div>
    </div>
  );
}
