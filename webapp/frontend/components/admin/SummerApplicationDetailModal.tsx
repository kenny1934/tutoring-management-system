"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { StatusBadge, ALL_STATUSES, STATUS_COLORS } from "./SummerApplicationCard";
import { summerAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import { formatPreferences } from "@/lib/summer-utils";
import { Copy, Check, Loader2, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { SummerApplication, SummerApplicationUpdate } from "@/types";

const inputClass = "w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-foreground text-sm disabled:opacity-50";

const NEXT_STATUS_MAP: Record<string, string[]> = {
  "Submitted":           ["Under Review", "Rejected"],
  "Under Review":        ["Placement Offered", "Waitlisted", "Rejected"],
  "Placement Offered":   ["Placement Confirmed", "Withdrawn"],
  "Placement Confirmed": ["Fee Sent"],
  "Fee Sent":            ["Paid"],
  "Paid":                ["Enrolled"],
};

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function FieldValue({ label, value, mono, copyable }: { label: string; value?: string | null; mono?: boolean; copyable?: boolean }) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    showToast("Copied", "success");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-baseline gap-2 py-1">
      <span className="text-xs text-muted-foreground shrink-0 w-28">{label}</span>
      <span className={`text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value}</span>
      {copyable && (
        <button onClick={handleCopy} className="p-0.5 text-muted-foreground hover:text-foreground">
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </div>
  );
}

interface SummerApplicationDetailModalProps {
  application: SummerApplication | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  readOnly?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  currentIndex?: number;
  totalCount?: number;
}

export function SummerApplicationDetailModal({
  application: app,
  isOpen,
  onClose,
  onUpdated,
  readOnly = false,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  currentIndex,
  totalCount,
}: SummerApplicationDetailModalProps) {
  const { showToast } = useToast();
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [langStream, setLangStream] = useState("");
  const [studentId, setStudentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAllStatuses, setShowAllStatuses] = useState(false);

  // Reset form when application changes or modal opens
  useEffect(() => {
    if (app && isOpen) {
      setStatus(app.application_status);
      setNotes(app.admin_notes || "");
      setLangStream(app.lang_stream || "");
      setStudentId(app.existing_student_id?.toString() || "");
      setShowAllStatuses(false);
    }
  }, [app, isOpen]);

  if (!app) return null;

  const hasChanges =
    status !== app.application_status ||
    notes !== (app.admin_notes || "") ||
    langStream !== (app.lang_stream || "") ||
    studentId !== (app.existing_student_id?.toString() || "");

  const handleSave = async () => {
    if (!hasChanges || saving || readOnly) return;
    setSaving(true);
    try {
      const update: SummerApplicationUpdate = {};
      if (status !== app.application_status) update.application_status = status;
      if (notes !== (app.admin_notes || "")) update.admin_notes = notes;
      if (langStream !== (app.lang_stream || "")) update.lang_stream = langStream;
      const newStudentId = studentId ? parseInt(studentId) : null;
      if (newStudentId !== (app.existing_student_id ?? null)) update.existing_student_id = newStudentId;

      await summerAPI.updateApplication(app.id, update);
      showToast("Application updated", "success");
      onUpdated();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Update failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const { pref1, pref2 } = formatPreferences(app);
  const submittedDate = app.submitted_at ? new Date(app.submitted_at).toLocaleString() : "—";
  const reviewedDate = app.reviewed_at ? new Date(app.reviewed_at).toLocaleString() : null;
  const nextStatuses = NEXT_STATUS_MAP[app.application_status];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <span>{app.student_name}</span>
          <StatusBadge status={app.application_status} />
        </div>
      }
      size="lg"
      footer={
        <div className="flex items-center">
          {/* Left: Prev/Next navigation */}
          {(onPrev || onNext) && (
            <div className="flex items-center gap-1">
              <button
                onClick={onPrev}
                disabled={!hasPrev}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Previous (←)"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {currentIndex != null && totalCount != null && (
                <span className="text-xs text-muted-foreground tabular-nums px-1">
                  {currentIndex + 1} / {totalCount}
                </span>
              )}
              <button
                onClick={onNext}
                disabled={!hasNext}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Next (→)"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Right: Cancel + Save */}
          {!readOnly && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Changes
              </button>
            </div>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* === 1. ACTION STRIP (top of body, immediately visible) === */}
        {!readOnly && (
          <div className="space-y-3">
            {/* Quick status pills */}
            {nextStatuses && (
              <div>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Move to</span>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {nextStatuses.map((s) => {
                    const colors = STATUS_COLORS[s];
                    const isSelected = status === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setStatus(s)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                          isSelected
                            ? cn(colors.bg, colors.text, "ring-2 ring-current")
                            : "text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700"
                        )}
                      >
                        <span className={cn("w-1.5 h-1.5 rounded-full", colors.dot)} />
                        {s}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setShowAllStatuses((v) => !v)}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1"
                  >
                    {showAllStatuses ? "Less" : "All statuses\u2026"}
                  </button>
                </div>
                {showAllStatuses && (
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={cn(inputClass, "mt-2 max-w-xs")}
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Lang stream pill toggle + Student ID */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Language</span>
                <div className="flex gap-1 mt-1">
                  {["CMI", "EMI"].map((ls) => (
                    <button
                      key={ls}
                      onClick={() => setLangStream(ls)}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-medium transition-all",
                        langStream === ls
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700"
                      )}
                    >
                      {ls}
                    </button>
                  ))}
                  {langStream && (
                    <button
                      onClick={() => setLangStream("")}
                      className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                      title="Clear"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Student ID</span>
                <input
                  type="number"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className={cn(inputClass, "mt-1 max-w-[120px]")}
                  placeholder="e.g. 42"
                />
              </div>
            </div>
          </div>
        )}

        {/* === 2. ADMIN NOTES (right below actions) === */}
        {!readOnly && (
          <div>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={notes ? 2 : 1}
              onFocus={(e) => { if (!notes) (e.target as HTMLTextAreaElement).rows = 2; }}
              onBlur={(e) => { if (!notes) (e.target as HTMLTextAreaElement).rows = 1; }}
              className={cn(inputClass, "mt-1 resize-none")}
              placeholder="Internal notes..."
            />
          </div>
        )}

        {/* === 3. STUDENT INFO (reference data) === */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <FieldGroup label="Student Info">
            <FieldValue label="Name" value={app.student_name} />
            <FieldValue label="School" value={app.school} />
            <FieldValue label="Grade" value={app.grade} />
            <FieldValue label="Language" value={app.lang_stream} />
            <FieldValue label="Existing Student" value={app.is_existing_student} />
            {app.current_centers && app.current_centers.length > 0 && (
              <FieldValue label="Centers" value={app.current_centers.join(", ")} />
            )}
          </FieldGroup>

          <FieldGroup label="Contact">
            <FieldValue label="WeChat" value={app.wechat_id} copyable />
            <FieldValue label="Phone" value={app.contact_phone} copyable />
          </FieldGroup>

          <FieldGroup label="Course Preferences">
            <FieldValue label="Location" value={app.preferred_location} />
            <FieldValue label="1st Preference" value={pref1 || null} />
            <FieldValue label="2nd Preference" value={pref2 || null} />
            <FieldValue label="Unavailable" value={app.unavailability_notes} />
          </FieldGroup>

          {(app.buddy_group_id || app.buddy_names) && (
            <FieldGroup label="Buddy Group">
              {app.buddy_group_id && <FieldValue label="Group ID" value={`#${app.buddy_group_id}`} />}
              <FieldValue label="Buddy Names" value={app.buddy_names} />
            </FieldGroup>
          )}
        </div>

        {/* === 4. APPLICATION META === */}
        <FieldGroup label="Application">
          <FieldValue label="Reference" value={app.reference_code} mono copyable />
          <FieldValue label="Form Language" value={app.form_language === "en" ? "English" : "中文"} />
          <FieldValue label="Submitted" value={submittedDate} />
          {reviewedDate && <FieldValue label="Reviewed by" value={`${app.reviewed_by} · ${reviewedDate}`} />}
        </FieldGroup>
      </div>
    </Modal>
  );
}
