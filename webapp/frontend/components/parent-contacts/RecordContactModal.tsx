"use client";

import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useTutors } from "@/lib/hooks";
import { parentCommunicationsAPI, studentsAPI, type ParentCommunication, type ParentCommunicationCreate } from "@/lib/api";
import type { Student } from "@/types";
import {
  X,
  Loader2,
  User,
  Calendar,
  MessageCircle,
  FileText,
  Bell,
  Search,
  Phone,
  TrendingUp,
  AlertTriangle
} from "lucide-react";

// Custom WeChat icon SVG
const WeChatIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.045c.134 0 .24-.111.24-.247 0-.06-.024-.12-.04-.178l-.326-1.233a.49.49 0 0 1 .178-.553c1.527-1.122 2.5-2.782 2.5-4.622 0-3.105-3.05-5.924-7.059-6.119zm-2.07 2.867c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.14 0c.535 0 .969.44.969.982a.976.976 0 0 1-.97.983.976.976 0 0 1-.968-.983c0-.542.434-.982.969-.982z"/>
  </svg>
);

// Custom In-Person icon SVG (two people meeting)
const InPersonIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="7" cy="6" r="3" />
    <circle cx="17" cy="6" r="3" />
    <path d="M2 20c0-3.5 2.5-6 5-6s5 2.5 5 6" />
    <path d="M12 20c0-3.5 2.5-6 5-6s5 2.5 5 6" />
  </svg>
);

const getMethodIcon = (method: string) => {
  switch (method) {
    case 'WeChat':
      return <WeChatIcon className="h-4 w-4 text-green-600" />;
    case 'Phone':
      return <Phone className="h-4 w-4 text-blue-600" />;
    case 'In-Person':
      return <InPersonIcon className="h-4 w-4 text-purple-600" />;
    default:
      return <MessageCircle className="h-4 w-4" />;
  }
};

const getContactTypeIcon = (type: string) => {
  switch (type) {
    case 'Progress Update':
      return <TrendingUp className="h-4 w-4 text-blue-600" />;
    case 'Concern':
      return <AlertTriangle className="h-4 w-4 text-orange-600" />;
    case 'General':
    default:
      return <MessageCircle className="h-4 w-4 text-gray-600" />;
  }
};
import {
  useFloating,
  useClick,
  useDismiss,
  useInteractions,
  FloatingOverlay,
  FloatingFocusManager,
} from "@floating-ui/react";
import useSWR from "swr";

type UserRole = 'tutor' | 'admin' | 'super_admin';

interface RecordContactModalProps {
  isOpen: boolean;
  onClose: (saved?: boolean) => void;
  editingContact: ParentCommunication | null;
  preselectedStudentId: number | null;
  tutorId?: number;
  location?: string;
  // OAuth-ready props (for future integration)
  currentUserTutorId?: number;  // The tutor ID associated with the logged-in user
  currentUserRole?: UserRole;   // The role of the logged-in user
}

const CONTACT_METHODS = ['WeChat', 'Phone', 'In-Person'];
const CONTACT_TYPES = ['Progress Update', 'Concern', 'General'];

export function RecordContactModal({
  isOpen,
  onClose,
  editingContact,
  preselectedStudentId,
  tutorId,
  location,
  currentUserTutorId,
  currentUserRole,
}: RecordContactModalProps) {
  const { data: allTutors = [] } = useTutors();

  // Filter tutors by location
  const tutors = useMemo(() => {
    if (!location || location === "All Locations") return allTutors;
    return allTutors.filter(t => t.default_location === location);
  }, [allTutors, location]);

  // Determine if tutor selection is editable
  // - For NEW contacts with OAuth: auto-select current user, not editable
  // - For EDITING: only admin/super_admin can change the tutor
  const canEditTutor = useMemo(() => {
    if (!currentUserTutorId) return true; // No OAuth yet, allow editing
    if (editingContact) {
      return currentUserRole === 'admin' || currentUserRole === 'super_admin';
    }
    return false; // New contact with OAuth - auto-select, no edit
  }, [currentUserTutorId, currentUserRole, editingContact]);
  const { data: allStudents = [], isLoading: loadingStudents } = useSWR(
    isOpen ? 'students-for-contact' : null,
    () => studentsAPI.getAll({ location, limit: 500 }),
    { revalidateOnFocus: false }
  );

  // Form state
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [selectedTutorId, setSelectedTutorId] = useState<number | null>(null);
  const [contactMethod, setContactMethod] = useState('WeChat');
  const [contactType, setContactType] = useState('Progress Update');
  const [contactDate, setContactDate] = useState('');
  const [contactTime, setContactTime] = useState('');
  const [briefNotes, setBriefNotes] = useState('');
  const [followUpNeeded, setFollowUpNeeded] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Student search
  const [studentSearch, setStudentSearch] = useState('');
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);

  // Filter students by search
  const filteredStudents = allStudents.filter(s =>
    !studentSearch ||
    s.student_name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.school_student_id?.toLowerCase().includes(studentSearch.toLowerCase())
  ).slice(0, 20);

  const selectedStudent = allStudents.find(s => s.id === selectedStudentId);
  const selectedTutor = tutors.find(t => t.id === selectedTutorId);

  // Initialize form when opening
  useEffect(() => {
    if (isOpen) {
      if (editingContact) {
        // Editing mode
        setSelectedStudentId(editingContact.student_id);
        setSelectedTutorId(editingContact.tutor_id);
        setContactMethod(editingContact.contact_method);
        setContactType(editingContact.contact_type);
        const date = new Date(editingContact.contact_date);
        setContactDate(date.toISOString().split('T')[0]);
        setContactTime(date.toTimeString().slice(0, 5));
        setBriefNotes(editingContact.brief_notes || '');
        setFollowUpNeeded(editingContact.follow_up_needed ?? false);
        setFollowUpDate(editingContact.follow_up_date || '');
      } else {
        // New contact
        setSelectedStudentId(preselectedStudentId);
        // Use currentUserTutorId if available (OAuth), otherwise fall back to tutorId prop
        setSelectedTutorId(currentUserTutorId || tutorId || null);
        setContactMethod('WeChat');
        setContactType('Progress Update');
        const now = new Date();
        setContactDate(now.toISOString().split('T')[0]);
        setContactTime(now.toTimeString().slice(0, 5));
        setBriefNotes('');
        setFollowUpNeeded(false);
        setFollowUpDate('');
      }
      setStudentSearch('');
      setError(null);
    }
  }, [isOpen, editingContact, preselectedStudentId, tutorId, currentUserTutorId]);

  // Floating UI
  const { refs, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open) onClose(false);
    },
  });

  const dismiss = useDismiss(context, { outsidePressEvent: "mousedown" });
  const { getFloatingProps } = useInteractions([dismiss]);

  const handleSubmit = async () => {
    if (!selectedStudentId) {
      setError('Please select a student');
      return;
    }
    if (!selectedTutorId) {
      setError('Please select who contacted the parent');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const contactDateTime = new Date(`${contactDate}T${contactTime}`);

      const data: ParentCommunicationCreate = {
        student_id: selectedStudentId,
        contact_method: contactMethod,
        contact_type: contactType,
        contact_date: contactDateTime.toISOString(),
        brief_notes: briefNotes || undefined,
        follow_up_needed: followUpNeeded,
        follow_up_date: followUpNeeded && followUpDate ? followUpDate : undefined,
      };

      if (editingContact) {
        await parentCommunicationsAPI.update(editingContact.id, data);
      } else {
        await parentCommunicationsAPI.create(data, selectedTutorId, 'system');
      }

      onClose(true);
    } catch (err) {
      console.error('Failed to save contact:', err);
      setError(err instanceof Error ? err.message : 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <FloatingOverlay
      className="z-50 bg-black/50 flex items-center justify-center p-4"
      lockScroll
    >
      <FloatingFocusManager context={context}>
        <div
          ref={refs.setFloating}
          {...getFloatingProps()}
          className={cn(
            "w-[448px] bg-white dark:bg-[#1a1a1a] rounded-lg shadow-xl",
            "border border-[#e8d4b8] dark:border-[#6b5a4a]",
            "max-h-[90vh] flex flex-col"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628] rounded-t-lg">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {editingContact ? 'Edit Contact Record' : 'Record Parent Contact'}
            </h2>
            <button
              onClick={() => onClose(false)}
              className="p-1.5 rounded hover:bg-white dark:hover:bg-gray-800 transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Student Selection */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                <User className="h-4 w-4 text-[#a0704b]" />
                Student <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={selectedStudent ? selectedStudent.student_name : studentSearch}
                  onChange={(e) => {
                    setStudentSearch(e.target.value);
                    setSelectedStudentId(null);
                    setShowStudentDropdown(true);
                  }}
                  onFocus={() => setShowStudentDropdown(true)}
                  className={cn(
                    "w-full pl-9 pr-3 py-2 text-sm",
                    "bg-white dark:bg-[#2d2618] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md",
                    "focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50"
                  )}
                />
                {showStudentDropdown && !selectedStudent && (
                  <div className={cn(
                    "absolute z-10 w-full mt-1 max-h-48 overflow-y-auto",
                    "bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md shadow-lg"
                  )}>
                    {loadingStudents ? (
                      <div className="p-3 text-center">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto text-gray-400" />
                      </div>
                    ) : filteredStudents.length === 0 ? (
                      <div className="p-3 text-center text-sm text-gray-500">
                        No students found
                      </div>
                    ) : (
                      filteredStudents.map(student => (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => {
                            setSelectedStudentId(student.id);
                            setStudentSearch('');
                            setShowStudentDropdown(false);
                          }}
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm",
                            "hover:bg-gray-100 dark:hover:bg-gray-800",
                            "text-gray-900 dark:text-gray-100"
                          )}
                        >
                          <div>{student.student_name}</div>
                          <div className="text-xs text-gray-500">
                            {student.school_student_id} · {student.grade}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {selectedStudent && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStudentId(null);
                    setStudentSearch('');
                  }}
                  className="text-xs text-[#a0704b] hover:underline"
                >
                  Change student
                </button>
              )}
            </div>

            {/* Contacted By (Tutor) */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                <User className="h-4 w-4 text-[#a0704b]" />
                Contacted By <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedTutorId || ''}
                onChange={(e) => setSelectedTutorId(e.target.value ? parseInt(e.target.value) : null)}
                disabled={!canEditTutor}
                className={cn(
                  "w-full px-3 py-2 text-sm",
                  "bg-white dark:bg-[#2d2618] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md",
                  "focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50",
                  !canEditTutor && "opacity-60 cursor-not-allowed"
                )}
              >
                <option value="">Select tutor...</option>
                {tutors.map(tutor => (
                  <option key={tutor.id} value={tutor.id}>
                    {tutor.tutor_name}
                  </option>
                ))}
              </select>
              {!canEditTutor && currentUserTutorId && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {editingContact ? "Only admins can change who contacted" : "Recording as yourself"}
                </p>
              )}
            </div>

            {/* Contact Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <Calendar className="h-4 w-4 text-[#a0704b]" />
                  Date
                </label>
                <input
                  type="date"
                  value={contactDate}
                  onChange={(e) => setContactDate(e.target.value)}
                  className={cn(
                    "w-full px-3 py-2 text-sm",
                    "bg-white dark:bg-[#2d2618] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md",
                    "focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50"
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Time
                </label>
                <input
                  type="time"
                  value={contactTime}
                  onChange={(e) => setContactTime(e.target.value)}
                  className={cn(
                    "w-full px-3 py-2 text-sm",
                    "bg-white dark:bg-[#2d2618] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md",
                    "focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50"
                  )}
                />
              </div>
            </div>

            {/* Method & Type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {getMethodIcon(contactMethod)}
                  Method
                </label>
                <select
                  value={contactMethod}
                  onChange={(e) => setContactMethod(e.target.value)}
                  className={cn(
                    "w-full px-3 py-2 text-sm",
                    "bg-white dark:bg-[#2d2618] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md",
                    "focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50"
                  )}
                >
                  {CONTACT_METHODS.map(method => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {getContactTypeIcon(contactType)}
                  Type
                </label>
                <select
                  value={contactType}
                  onChange={(e) => setContactType(e.target.value)}
                  className={cn(
                    "w-full px-3 py-2 text-sm",
                    "bg-white dark:bg-[#2d2618] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md",
                    "focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50"
                  )}
                >
                  {CONTACT_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                <FileText className="h-4 w-4 text-[#a0704b]" />
                Notes
              </label>
              <textarea
                value={briefNotes}
                onChange={(e) => setBriefNotes(e.target.value)}
                placeholder="Brief summary of the conversation..."
                rows={3}
                className={cn(
                  "w-full px-3 py-2 text-sm",
                  "bg-white dark:bg-[#2d2618] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md",
                  "focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50",
                  "resize-none"
                )}
              />
            </div>

            {/* Follow-up */}
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={followUpNeeded}
                  onChange={(e) => setFollowUpNeeded(e.target.checked)}
                  className="rounded border-[#d4a574] text-[#a0704b] focus:ring-[#a0704b]"
                />
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <Bell className="h-4 w-4 text-blue-500" />
                  Follow-up needed
                </span>
              </label>

              {followUpNeeded && (
                <div className="ml-6 space-y-1.5">
                  <label className="text-sm text-gray-600 dark:text-gray-400">
                    Follow-up by
                  </label>
                  <input
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className={cn(
                      "w-full px-3 py-2 text-sm",
                      "bg-white dark:bg-[#2d2618] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md",
                      "focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50"
                    )}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3]/50 dark:bg-[#3d3628]/50 rounded-b-lg">
            <button
              type="button"
              onClick={() => onClose(false)}
              disabled={saving}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                "text-gray-700 dark:text-gray-300",
                "hover:bg-gray-100 dark:hover:bg-gray-800",
                "disabled:opacity-50"
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !selectedStudentId || !selectedTutorId}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors",
                "bg-[#a0704b] dark:bg-[#8b6f47] text-white",
                "hover:bg-[#8b5d3b] dark:hover:bg-[#7a5f3a]",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingContact ? 'Update' : 'Save Contact'}
            </button>
          </div>
        </div>
      </FloatingFocusManager>
    </FloatingOverlay>
  );
}
