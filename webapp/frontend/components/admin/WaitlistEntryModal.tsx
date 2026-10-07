"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { X, Plus, Trash2, Search } from "lucide-react";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button, Field, IconButton, Input, LABEL_CLASS, Label, Segmented, Select, Textarea } from "@/components/controls";
import { waitlistAPI, studentsAPI } from "@/lib/api";
import { useLocation } from "@/contexts/LocationContext";
import { useToast } from "@/contexts/ToastContext";
import { useActiveTutors } from "@/lib/hooks";
import { isHomeBranch, pickableForOpenEndedWork } from "@/lib/employment";
import { formatTimeAgo } from "@/lib/formatters";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";
import { GRADES, DAY_NAMES, DAY_NAME_TO_INDEX, getTimeSlotsForDay, ALL_TIME_SLOTS } from "@/lib/constants";
import type {
  WaitlistEntry,
  WaitlistEntryCreate,
  WaitlistSlotPreferenceCreate,
  Student,
} from "@/types";
import { GradeBadge } from "@/components/ui/grade-label";

interface WaitlistEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  entry?: WaitlistEntry | null;
}

const LANG_STREAMS = ["E", "C"];
const DAYS = DAY_NAMES; // Sun-Sat

export function WaitlistEntryModal({
  isOpen,
  onClose,
  onSuccess,
  entry,
}: WaitlistEntryModalProps) {
  const { selectedLocation, locations } = useLocation();
  const { showToast, showError } = useToast();
  // A waitlist preference has no end date, so the server refuses anybody
  // with a leaving date at all. Offering them here would only produce a
  // save that fails.
  const { data: allTutors = [] } = useActiveTutors();
  const tutors = useMemo(() => pickableForOpenEndedWork(allTutors), [allTutors]);

  const [studentName, setStudentName] = useState("");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [langStream, setLangStream] = useState("");
  const [phone, setPhone] = useState("");
  const [parentName, setParentName] = useState("");
  const [notes, setNotes] = useState("");
  const [entryType, setEntryType] = useState<"New" | "Slot Change">("New");
  const [studentId, setStudentId] = useState<number | null>(null);
  const [slotPreferences, setSlotPreferences] = useState<
    WaitlistSlotPreferenceCreate[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const modalScrollRef = useRef<HTMLDivElement>(null);

  // Student search for linking
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState<Student[]>([]);
  const [showStudentSearch, setShowStudentSearch] = useState(false);
  const [linkedStudent, setLinkedStudent] = useState<Student | null>(null);

  // School autocomplete
  const [schoolOptions, setSchoolOptions] = useState<string[]>([]);
  const [showSchoolOptions, setShowSchoolOptions] = useState(false);

  // Load school options
  useEffect(() => {
    studentsAPI.getSchools().then(setSchoolOptions).catch(() => {});
  }, []);

  // Populate form for edit mode
  useEffect(() => {
    setIsDirty(false);
    setShowDiscardConfirm(false);
    let cancelled = false;
    if (entry) {
      setStudentName(entry.student_name);
      setSchool(entry.school);
      setGrade(entry.grade);
      setLangStream(entry.lang_stream || "");
      setPhone(entry.phone);
      setParentName(entry.parent_name || "");
      setNotes(entry.notes || "");
      setEntryType(entry.entry_type);
      setStudentId(entry.student_id || null);
      if (entry.student_id) {
        studentsAPI.getById(entry.student_id)
          .then((s) => { if (!cancelled) setLinkedStudent(s); })
          .catch(() => { if (!cancelled) setLinkedStudent(null); });
      } else {
        setLinkedStudent(null);
      }
      setSlotPreferences(
        entry.slot_preferences.map((sp) => ({
          location: sp.location,
          day_of_week: sp.day_of_week || null,
          time_slot: sp.time_slot || null,
          preferred_tutor_id: sp.preferred_tutor_id || null,
        }))
      );
    } else {
      setStudentName("");
      setSchool("");
      setGrade("");
      setLangStream("");
      setPhone("");
      setParentName("");
      setNotes("");
      setEntryType("New");
      setStudentId(null);
      setLinkedStudent(null);
      setSlotPreferences([]);
    }
    return () => { cancelled = true; };
  }, [entry, isOpen]);

  // Scroll modal to bottom when a new slot preference is added
  const prevSlotCountRef = useRef(0);
  useEffect(() => {
    if (slotPreferences.length > prevSlotCountRef.current && prevSlotCountRef.current > 0) {
      modalScrollRef.current?.scrollTo({ top: modalScrollRef.current.scrollHeight, behavior: "smooth" });
    }
    prevSlotCountRef.current = slotPreferences.length;
  }, [slotPreferences.length]);

  // Student search
  const searchStudents = useCallback(async (q: string) => {
    if (q.length < 2) {
      setStudentResults([]);
      return;
    }
    try {
      const results = await studentsAPI.getAll({ search: q, limit: 10 });
      setStudentResults(results);
    } catch {
      setStudentResults([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchStudents(studentSearch), 300);
    return () => clearTimeout(timer);
  }, [studentSearch, searchStudents]);

  const handleLinkStudent = (student: Student) => {
    setStudentId(student.id);
    setLinkedStudent(student);
    // Auto-fill fields from student if empty
    if (!studentName) setStudentName(student.student_name);
    if (!school && student.school) setSchool(student.school);
    if (!grade && student.grade) setGrade(student.grade);
    if (!langStream && student.lang_stream) setLangStream(student.lang_stream);
    if (!phone && student.phone) setPhone(student.phone);
    setShowStudentSearch(false);
    setStudentSearch("");
    setIsDirty(true);
  };

  const handleUnlinkStudent = () => {
    setStudentId(null);
    setLinkedStudent(null);
    setIsDirty(true);
  };

  const addSlotPreference = () => {
    const defaultLoc =
      selectedLocation !== "All Locations"
        ? selectedLocation
        : locations.find((l) => l !== "All Locations") || "MSA";
    setSlotPreferences((prev) => [
      ...prev,
      { location: defaultLoc, day_of_week: null, time_slot: null, preferred_tutor_id: null },
    ]);
    setIsDirty(true);
  };

  const removeSlotPreference = (index: number) => {
    setSlotPreferences((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const updateSlotPreference = (
    index: number,
    field: keyof WaitlistSlotPreferenceCreate,
    value: string | number | null
  ) => {
    setSlotPreferences((prev) =>
      prev.map((sp, i) => {
        if (i !== index) return sp;
        const updated = { ...sp, [field]: value };
        // Clear time_slot if day changed and current time is invalid for the new day
        if (field === "day_of_week" && updated.time_slot && value) {
          const dayIdx = DAY_NAME_TO_INDEX[value] ?? 1;
          const validSlots = getTimeSlotsForDay(dayIdx) as readonly string[];
          if (!validSlots.includes(updated.time_slot)) {
            updated.time_slot = null;
          }
        }
        return updated;
      })
    );
  };

  const handleSubmit = async () => {
    if (!studentName.trim() && !phone.trim() && !parentName.trim()) {
      showError("At least one of student name, phone, or parent WeChat ID is required");
      return;
    }

    setSaving(true);
    try {
      const data: WaitlistEntryCreate = {
        student_name: studentName.trim(),
        school: school.trim(),
        grade,
        lang_stream: langStream || null,
        phone: phone.trim(),
        parent_name: parentName.trim() || null,
        notes: notes.trim() || null,
        entry_type: entryType,
        student_id: studentId,
        slot_preferences: slotPreferences,
      };

      if (entry) {
        await waitlistAPI.update(entry.id, {
          ...data,
          slot_preferences: slotPreferences,
        });
        showToast("Waitlist entry updated");
      } else {
        await waitlistAPI.create(data);
        showToast("Added to waitlist");
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  }, [isDirty, onClose]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const filteredSchools = schoolOptions.filter(
    (s) => s.toLowerCase().includes(school.toLowerCase()) && s !== school
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="waitlist-modal-title">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={handleClose}
      />
      <div ref={modalScrollRef} className="relative bg-white dark:bg-[#1e1e1e] rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-[#1e1e1e] border-b border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between rounded-t-xl z-10">
          <div className="min-w-0">
            <h2 id="waitlist-modal-title" className="text-lg font-semibold text-foreground">
              {entry ? "Edit Waitlist Entry" : "Add to Waitlist"}
            </h2>
            {entry?.created_at && (() => {
              const utcTs = entry.created_at.endsWith("Z") ? entry.created_at : entry.created_at + "Z";
              const date = new Date(utcTs);
              const absDate = date.toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <p
                  className="mt-0.5 text-xs text-foreground/50"
                  title={absDate}
                >
                  Added {formatTimeAgo(utcTs)}
                  {entry.created_by_name ? ` by ${entry.created_by_name}` : ""}
                  <span className="text-foreground/40"> · {absDate}</span>
                </p>
              );
            })()}
          </div>
          <IconButton icon={X} label="Close" onClick={handleClose} />
        </div>

        <div className="px-5 py-4 space-y-4" onChangeCapture={() => setIsDirty(true)}>
          {/* Entry Type Toggle */}
          <div>
            <Label>Type</Label>
            <Segmented
              label="Type"
              value={entryType}
              onChange={(type) => { setEntryType(type); setIsDirty(true); }}
              options={(["New", "Slot Change"] as const).map((type) => ({ value: type, label: type }))}
            />
          </div>

          {/* Link Student */}
          <div>
            <Label htmlFor={studentId ? undefined : "waitlist-student-search"}>Linked student</Label>
            {studentId ? (
              <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {linkedStudent?.school_student_id && (
                    <span className="text-xs font-mono text-green-700 dark:text-green-400 flex-shrink-0">
                      {linkedStudent.school_student_id}
                    </span>
                  )}
                  <span className="text-sm font-medium text-green-800 dark:text-green-300 truncate">
                    {linkedStudent?.student_name || studentId}
                  </span>
                  {linkedStudent?.grade && (
                    <GradeBadge className="px-1.5 py-0.5 rounded text-[11px] font-medium text-gray-800 flex-shrink-0" grade={linkedStudent.grade} langStream={linkedStudent.lang_stream} />
                  )}
                  {linkedStudent?.school && (
                    <span className="text-xs text-green-700 dark:text-green-400 flex-shrink-0">
                      {linkedStudent.school}
                    </span>
                  )}
                </div>
                <IconButton icon={X} size="sm" tone="danger" label="Unlink student" onClick={handleUnlinkStudent} />
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" aria-hidden="true" />
                  <Input
                    id="waitlist-student-search"
                    type="text"
                    value={studentSearch}
                    onChange={(e) => {
                      setStudentSearch(e.target.value);
                      setShowStudentSearch(true);
                    }}
                    onFocus={() => setShowStudentSearch(true)}
                    placeholder="Search by name, ID, or phone..."
                    className="pl-9"
                  />
                </div>
                {showStudentSearch && studentResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#2a2a2a] rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg z-20 max-h-48 overflow-y-auto">
                    {studentResults.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleLinkStudent(s)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        {s.school_student_id && (
                          <span className="text-[11px] font-mono text-foreground/40 flex-shrink-0">
                            {s.school_student_id}
                          </span>
                        )}
                        <span className="font-medium truncate">
                          {s.student_name}
                        </span>
                        {s.grade && (
                          <GradeBadge className="px-1.5 py-0.5 rounded text-[11px] font-medium text-gray-800 flex-shrink-0" grade={s.grade} langStream={s.lang_stream} />
                        )}
                        {s.school && (
                          <span className="text-[11px] text-foreground/50 flex-shrink-0">
                            {s.school}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Name + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={<>Student name <span className="text-red-600" aria-hidden="true">*</span></>} id="waitlist-student-name">
              <Input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="e.g. Chan Tai Man"
              />
            </Field>
            <Field label={<>Phone <span className="text-red-600" aria-hidden="true">*</span></>} id="waitlist-phone">
              <Input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 91234567"
              />
            </Field>
          </div>

          {/* School + Grade + Lang */}
          <div className="grid grid-cols-3 gap-3">
            <div className="relative">
              <Label htmlFor="waitlist-school">
                School <span className="text-red-600" aria-hidden="true">*</span>
              </Label>
              <Input
                id="waitlist-school"
                type="text"
                value={school}
                onChange={(e) => {
                  setSchool(e.target.value);
                  setShowSchoolOptions(true);
                }}
                onFocus={() => setShowSchoolOptions(true)}
                onBlur={() =>
                  setTimeout(() => setShowSchoolOptions(false), 200)
                }
                placeholder="e.g. PCMS"
              />
              {showSchoolOptions && filteredSchools.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#2a2a2a] rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg z-20 max-h-32 overflow-y-auto">
                  {filteredSchools.slice(0, 8).map((s) => (
                    <button
                      key={s}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSchool(s);
                        setShowSchoolOptions(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Field label={<>Grade <span className="text-red-600" aria-hidden="true">*</span></>} id="waitlist-grade">
              <Select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
              >
                <option value="">Select</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Stream" id="waitlist-stream">
              <Select
                value={langStream}
                onChange={(e) => setLangStream(e.target.value)}
              >
                <option value="">—</option>
                {LANG_STREAMS.map((ls) => (
                  <option key={ls} value={ls}>
                    {ls}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* Parent WeChat ID */}
          <div>
            <Label htmlFor="waitlist-parent-wechat" className="flex items-center gap-1.5">
              <WeChatIcon className="h-3.5 w-3.5 text-green-700" />
              Parent WeChat ID
            </Label>
            <Input
              id="waitlist-parent-wechat"
              type="text"
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              placeholder="Optional"
            />
          </div>

          {/* Notes */}
          <Field label="Notes" id="waitlist-notes">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none"
              rows={2}
              placeholder="Source, context, etc."
            />
          </Field>

          {/* Slot Preferences */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className={LABEL_CLASS}>Preferred slots</span>
              <Button size="sm" variant="quiet" icon={Plus} onClick={addSlotPreference}>
                Add slot
              </Button>
            </div>
            {slotPreferences.length === 0 ? (
              <p className="text-xs text-foreground/40 italic">
                No slot preferences — any available slot
              </p>
            ) : (
              <div className="space-y-2">
                {slotPreferences.map((sp, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                  >
                    <Select
                      size="sm"
                      aria-label={`Slot ${i + 1} location`}
                      className="w-auto"
                      value={sp.location}
                      onChange={(e) =>
                        updateSlotPreference(i, "location", e.target.value)
                      }
                    >
                      {locations
                        .filter((l) => l !== "All Locations")
                        .map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                    </Select>
                    <Select
                      size="sm"
                      aria-label={`Slot ${i + 1} day`}
                      className="w-auto"
                      value={sp.day_of_week || ""}
                      onChange={(e) =>
                        updateSlotPreference(
                          i,
                          "day_of_week",
                          e.target.value || null
                        )
                      }
                    >
                      <option value="">Any day</option>
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </Select>
                    <div className="flex-1 min-w-0">
                    <Select
                      size="sm"
                      aria-label={`Slot ${i + 1} time`}
                      value={sp.time_slot || ""}
                      onChange={(e) =>
                        updateSlotPreference(
                          i,
                          "time_slot",
                          e.target.value || null
                        )
                      }
                    >
                      <option value="">Any time</option>
                      {(sp.day_of_week
                        ? getTimeSlotsForDay(DAY_NAME_TO_INDEX[sp.day_of_week] ?? 1)
                        : ALL_TIME_SLOTS
                      ).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                    </div>
                    <Select
                      size="sm"
                      aria-label={`Slot ${i + 1} tutor`}
                      className="w-auto"
                      value={sp.preferred_tutor_id ?? ""}
                      onChange={(e) =>
                        updateSlotPreference(
                          i,
                          "preferred_tutor_id",
                          e.target.value ? Number(e.target.value) : null
                        )
                      }
                    >
                      <option value="">Any tutor</option>
                      {[...tutors]
                        .filter((t) => !t.default_location || isHomeBranch(t, sp.location))
                        .sort((a, b) => getTutorSortName(a.tutor_name).localeCompare(getTutorSortName(b.tutor_name)))
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.tutor_name}
                          </option>
                        ))}
                    </Select>
                    <IconButton
                      icon={Trash2}
                      size="sm"
                      tone="danger"
                      label={`Remove slot ${i + 1}`}
                      onClick={() => removeSlotPreference(i)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-[#1e1e1e] border-t border-gray-200 dark:border-gray-700 px-5 py-3 flex justify-end gap-2 rounded-b-xl">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={handleSubmit}>
            {saving ? "Saving..." : entry ? "Save changes" : "Add to waitlist"}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        isOpen={showDiscardConfirm}
        title="Discard changes?"
        message="You have unsaved changes. Are you sure you want to discard them?"
        confirmText="Discard"
        cancelText="Keep editing"
        variant="warning"
        onConfirm={() => { setShowDiscardConfirm(false); onClose(); }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
    </div>
  );
}
