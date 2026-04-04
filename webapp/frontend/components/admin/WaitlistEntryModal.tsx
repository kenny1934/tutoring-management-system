"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Plus, Trash2, Search } from "lucide-react";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";
import { cn } from "@/lib/utils";
import { waitlistAPI, studentsAPI } from "@/lib/api";
import { useLocation } from "@/contexts/LocationContext";
import { useToast } from "@/contexts/ToastContext";
import { getGradeColor, GRADES, DAY_NAMES, DAY_NAME_TO_INDEX, getTimeSlotsForDay, ALL_TIME_SLOTS } from "@/lib/constants";
import type {
  WaitlistEntry,
  WaitlistEntryCreate,
  WaitlistSlotPreferenceCreate,
  Student,
} from "@/types";

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
  };

  const handleUnlinkStudent = () => {
    setStudentId(null);
    setLinkedStudent(null);
  };

  const addSlotPreference = () => {
    const defaultLoc =
      selectedLocation !== "All Locations"
        ? selectedLocation
        : locations[0] || "MSA";
    setSlotPreferences((prev) => [
      ...prev,
      { location: defaultLoc, day_of_week: null, time_slot: null },
    ]);
  };

  const removeSlotPreference = (index: number) => {
    setSlotPreferences((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSlotPreference = (
    index: number,
    field: keyof WaitlistSlotPreferenceCreate,
    value: string | null
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
    if (!studentName.trim() || !school.trim() || !grade || !phone.trim()) {
      showError("Please fill in all required fields");
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

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredSchools = schoolOptions.filter(
    (s) => s.toLowerCase().includes(school.toLowerCase()) && s !== school
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="waitlist-modal-title">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative bg-white dark:bg-[#1e1e1e] rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-[#1e1e1e] border-b border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between rounded-t-xl z-10">
          <h2 id="waitlist-modal-title" className="text-lg font-semibold text-foreground">
            {entry ? "Edit Waitlist Entry" : "Add to Waitlist"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Entry Type Toggle */}
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1.5">
              Type
            </label>
            <div className="flex gap-2">
              {(["New", "Slot Change"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setEntryType(type)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    entryType === type
                      ? "bg-[#a0704b] text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-foreground/70 hover:bg-gray-200 dark:hover:bg-gray-700"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Link Student */}
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1.5">
              Linked Student
            </label>
            {studentId ? (
              <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {linkedStudent?.school_student_id && (
                    <span className="text-xs font-mono text-green-600 dark:text-green-400 flex-shrink-0">
                      {linkedStudent.school_student_id}
                    </span>
                  )}
                  <span className="text-sm font-medium text-green-800 dark:text-green-300 truncate">
                    {linkedStudent?.student_name || studentId}
                  </span>
                  {linkedStudent?.grade && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-800 flex-shrink-0"
                      style={{
                        backgroundColor: getGradeColor(
                          linkedStudent.grade,
                          linkedStudent.lang_stream || undefined
                        ),
                      }}
                    >
                      {linkedStudent.grade}
                      {linkedStudent.lang_stream}
                    </span>
                  )}
                  {linkedStudent?.school && (
                    <span className="text-xs text-green-600 dark:text-green-400 flex-shrink-0">
                      {linkedStudent.school}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleUnlinkStudent}
                  className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => {
                      setStudentSearch(e.target.value);
                      setShowStudentSearch(true);
                    }}
                    onFocus={() => setShowStudentSearch(true)}
                    placeholder="Search by name, ID, or phone..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
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
                          <span className="text-[10px] font-mono text-foreground/40 flex-shrink-0">
                            {s.school_student_id}
                          </span>
                        )}
                        <span className="font-medium truncate">
                          {s.student_name}
                        </span>
                        {s.grade && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-800 flex-shrink-0"
                            style={{
                              backgroundColor: getGradeColor(
                                s.grade,
                                s.lang_stream || undefined
                              ),
                            }}
                          >
                            {s.grade}
                            {s.lang_stream}
                          </span>
                        )}
                        {s.school && (
                          <span className="text-[10px] text-foreground/50 flex-shrink-0">
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
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1.5">
                Student Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
                placeholder="e.g. Chan Tai Man"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1.5">
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
                placeholder="e.g. 91234567"
              />
            </div>
          </div>

          {/* School + Grade + Lang */}
          <div className="grid grid-cols-3 gap-3">
            <div className="relative">
              <label className="block text-sm font-medium text-foreground/70 mb-1.5">
                School <span className="text-red-500">*</span>
              </label>
              <input
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
                className="w-full px-3 py-2 rounded-lg border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
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
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1.5">
                Grade <span className="text-red-500">*</span>
              </label>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
              >
                <option value="">Select</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1.5">
                Stream
              </label>
              <select
                value={langStream}
                onChange={(e) => setLangStream(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
              >
                <option value="">—</option>
                {LANG_STREAMS.map((ls) => (
                  <option key={ls} value={ls}>
                    {ls}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Parent WeChat ID */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-foreground/70 mb-1.5">
              <WeChatIcon className="h-4 w-4 text-green-600" />
              Parent WeChat ID
            </label>
            <input
              type="text"
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
              placeholder="Optional"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1.5">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-[#a0704b] resize-none"
              rows={2}
              placeholder="Source, context, etc."
            />
          </div>

          {/* Slot Preferences */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground/70">
                Preferred Slots
              </label>
              <button
                onClick={addSlotPreference}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#a0704b] hover:bg-[#a0704b]/10 rounded-lg transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Slot
              </button>
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
                    className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                  >
                    <select
                      value={sp.location}
                      onChange={(e) =>
                        updateSlotPreference(i, "location", e.target.value)
                      }
                      className="px-2 py-1.5 rounded border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 text-xs focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
                    >
                      {locations
                        .filter((l) => l !== "All Locations")
                        .map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                    </select>
                    <select
                      value={sp.day_of_week || ""}
                      onChange={(e) =>
                        updateSlotPreference(
                          i,
                          "day_of_week",
                          e.target.value || null
                        )
                      }
                      className="px-2 py-1.5 rounded border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 text-xs focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
                    >
                      <option value="">Any day</option>
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <select
                      value={sp.time_slot || ""}
                      onChange={(e) =>
                        updateSlotPreference(
                          i,
                          "time_slot",
                          e.target.value || null
                        )
                      }
                      className="px-2 py-1.5 rounded border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 text-xs focus:outline-none focus:ring-1 focus:ring-[#a0704b] flex-1"
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
                    </select>
                    <button
                      onClick={() => removeSlotPreference(i)}
                      className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-[#1e1e1e] border-t border-gray-200 dark:border-gray-700 px-5 py-3 flex justify-end gap-2 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-[#a0704b] hover:bg-[#8b6040] rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : entry ? "Save Changes" : "Add to Waitlist"}
          </button>
        </div>
      </div>
    </div>
  );
}
