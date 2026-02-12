"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/contexts/ToastContext";
import { useLocation } from "@/contexts/LocationContext";
import { User, Loader2, GraduationCap, Phone, Building2, MapPin, BookOpen, FlaskConical, AlertTriangle, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { studentsAPI, StudentCreate } from "@/lib/api";
import type { Student } from "@/types";

const GRADES = ["F1", "F2", "F3", "F4", "F5", "F6"];
const ACADEMIC_STREAMS = ["Arts", "Science", "Commerce"];
const SENIOR_GRADES = ["F4", "F5", "F6"];

interface DuplicateMatch {
  id: number;
  student_name: string;
  school_student_id: string | null;
  school: string | null;
  grade: string | null;
  match_reason: string;
}

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (student: Student) => void;
}

export function AddStudentModal({
  isOpen,
  onClose,
  onSuccess,
}: AddStudentModalProps) {
  const { showToast } = useToast();
  const { selectedLocation: appLocation, locations: allLocations } = useLocation();

  // Get real locations (exclude "All Locations")
  const availableLocations = allLocations.filter((l) => l !== "All Locations");

  // Determine if location should be locked to app's selection
  const isLocationLocked = appLocation !== "All Locations";

  // Form state
  const [studentName, setStudentName] = useState("");
  const [grade, setGrade] = useState("");
  const [school, setSchool] = useState("");
  const [phone, setPhone] = useState("");
  const [homeLocation, setHomeLocation] = useState(availableLocations[0] || "MSA");
  const [langStream, setLangStream] = useState("");
  const [academicStream, setAcademicStream] = useState("");

  // Track if lang stream was manually changed
  const [langStreamManuallySet, setLangStreamManuallySet] = useState(false);

  // School autocomplete
  const [allSchools, setAllSchools] = useState<string[]>([]);
  const [showSchoolSuggestions, setShowSchoolSuggestions] = useState(false);

  // Next ID preview
  const [nextId, setNextId] = useState<string | null>(null);

  // Duplicate detection
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Show academic stream only for F4+
  const showAcademicStream = SENIOR_GRADES.includes(grade);

  // Fetch schools for autocomplete
  useEffect(() => {
    studentsAPI.getSchools().then(setAllSchools).catch(() => { /* non-critical */ });
  }, []);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStudentName("");
      setGrade("");
      setSchool("");
      setPhone("");
      setHomeLocation(isLocationLocked ? appLocation : availableLocations[0] || "MSA");
      setLangStream("");
      setAcademicStream("");
      setLangStreamManuallySet(false);
      setNextId(null);
      setDuplicates([]);
    }
  }, [isOpen, isLocationLocked, appLocation]);

  // Set location from app context when modal opens (if locked)
  useEffect(() => {
    if (isOpen && isLocationLocked) {
      setHomeLocation(appLocation);
    }
  }, [isOpen, isLocationLocked, appLocation]);

  // Fetch next ID when location changes
  useEffect(() => {
    if (homeLocation && isOpen) {
      studentsAPI.getNextId(homeLocation)
        .then(r => setNextId(r.next_id))
        .catch(() => setNextId(null));
    }
  }, [homeLocation, isOpen]);

  // Check for duplicates (debounced)
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (studentName.trim().length >= 2 && homeLocation && isOpen) {
        studentsAPI.checkDuplicates(studentName.trim(), homeLocation, phone || undefined)
          .then(r => setDuplicates(r.duplicates))
          .catch(() => setDuplicates([]));
      } else {
        setDuplicates([]);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [studentName, homeLocation, phone, isOpen]);

  // Clear academic stream when grade changes to non-senior
  useEffect(() => {
    if (!SENIOR_GRADES.includes(grade)) {
      setAcademicStream("");
    }
  }, [grade]);

  // Filter schools for autocomplete
  const filteredSchools = school
    ? allSchools.filter((s) =>
        s.toLowerCase().includes(school.toLowerCase())
      ).slice(0, 8)
    : [];

  // Handle school selection from autocomplete - fetch school info for lang stream
  const handleSchoolSelect = async (selectedSchool: string) => {
    setSchool(selectedSchool);
    setShowSchoolSuggestions(false);

    // Only auto-fill lang stream if not manually set
    if (!langStreamManuallySet) {
      try {
        const info = await studentsAPI.getSchoolInfo(selectedSchool);
        if (info.lang_stream) {
          setLangStream(info.lang_stream);
        }
      } catch {
        // Silently ignore - school info is optional
      }
    }
  };

  const handleSubmit = async () => {
    if (!studentName.trim()) {
      showToast("Student name is required", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const data: StudentCreate = {
        student_name: studentName.trim(),
        grade: grade || undefined,
        school: school || undefined,
        phone: phone || undefined,
        home_location: homeLocation || undefined,
        lang_stream: langStream || undefined,
        academic_stream: showAcademicStream && academicStream ? academicStream : undefined,
      };

      const newStudent = await studentsAPI.create(data);
      showToast(`Student "${newStudent.student_name}" created (ID: ${newStudent.school_student_id})`, "success");
      onSuccess?.(newStudent);
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to create student", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <span>Add New Student</span>
          {nextId && (
            <span className="ml-auto flex items-center gap-1 text-sm font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded">
              <Hash className="h-3.5 w-3.5" />
              {nextId}
            </span>
          )}
        </div>
      }
    >
      <div className="space-y-4 p-4">
        {/* Duplicate Warning */}
        {duplicates.length > 0 && (
          <div id="student-duplicate-warning" role="alert" className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">Potential duplicate found</p>
              <ul className="mt-1 space-y-1 text-amber-700 dark:text-amber-300">
                {duplicates.map((d) => (
                  <li key={d.id}>
                    {d.student_name} {d.school_student_id && `(${d.school_student_id})`}
                    {d.grade && ` - ${d.grade}`}
                    <span className="text-amber-600 dark:text-amber-400 text-xs ml-1">({d.match_reason})</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Student Name (required) */}
        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">
            Student Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            placeholder="Enter student name"
            required
            aria-required="true"
            aria-describedby={duplicates.length > 0 ? "student-duplicate-warning" : undefined}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/50"
            autoFocus
          />
        </div>

        {/* Grade & Location Row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Grade */}
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">
              <GraduationCap className="h-3.5 w-3.5 inline mr-1" />
              Grade
            </label>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Select grade</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">
              <MapPin className="h-3.5 w-3.5 inline mr-1" />
              Location
            </label>
            <select
              value={homeLocation}
              onChange={(e) => setHomeLocation(e.target.value)}
              disabled={isLocationLocked}
              className={cn(
                "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/50",
                isLocationLocked && "opacity-60 cursor-not-allowed"
              )}
            >
              {availableLocations.map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>
        </div>

        {/* School (autocomplete) */}
        <div className="relative">
          <label className="block text-sm font-medium text-foreground/70 mb-1">
            <Building2 className="h-3.5 w-3.5 inline mr-1" />
            School
          </label>
          <input
            type="text"
            value={school}
            onChange={(e) => {
              setSchool(e.target.value);
              setShowSchoolSuggestions(true);
            }}
            onFocus={() => setShowSchoolSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSchoolSuggestions(false), 200)}
            placeholder="Search or enter school name"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {showSchoolSuggestions && filteredSchools.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {filteredSchools.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSchoolSelect(s)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lang Stream & Academic Stream Row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Language Stream - C/E Toggle */}
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">
              <BookOpen className="h-3.5 w-3.5 inline mr-1" />
              Lang Stream
            </label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => { setLangStream("C"); setLangStreamManuallySet(true); }}
                className={cn(
                  "flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-all",
                  langStream === "C"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-primary/50"
                )}
              >
                C
              </button>
              <button
                type="button"
                onClick={() => { setLangStream("E"); setLangStreamManuallySet(true); }}
                className={cn(
                  "flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-all",
                  langStream === "E"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-primary/50"
                )}
              >
                E
              </button>
            </div>
          </div>

          {/* Academic Stream (F4+ only) OR empty space */}
          {showAcademicStream ? (
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">
                <FlaskConical className="h-3.5 w-3.5 inline mr-1" />
                Academic Stream
              </label>
              <select
                value={academicStream}
                onChange={(e) => setAcademicStream(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Select stream</option>
                {ACADEMIC_STREAMS.map((as) => (
                  <option key={as} value={as}>{as}</option>
                ))}
              </select>
            </div>
          ) : (
            <div /> /* Empty placeholder to maintain grid layout */
          )}
        </div>

        {/* Phone (always last row) */}
        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">
            <Phone className="h-3.5 w-3.5 inline mr-1" />
            Phone
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Optional"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !studentName.trim()}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Student"
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
