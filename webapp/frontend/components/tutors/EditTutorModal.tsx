"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useLocations } from "@/lib/hooks";
import { tutorsAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
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
  const [isSaving, setIsSaving] = useState(false);

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
  }, [isOpen, tutor]);

  // Build the location options, making sure the tutor's current value is present
  // even if it isn't in the active-locations list.
  const locationOptions = (() => {
    const opts = [...(locations ?? [])].filter((l) => l && l !== "All Locations");
    if (tutor.default_location && !opts.includes(tutor.default_location)) {
      opts.unshift(tutor.default_location);
    }
    return opts;
  })();

  const handleSave = async () => {
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
    };

    setIsSaving(true);
    try {
      const updated = await tutorsAPI.update(tutor.id, payload);
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
      </div>
    </Modal>
  );
}
