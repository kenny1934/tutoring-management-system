"use client";

import { cn } from "@/lib/utils";
import { Button, IconButton } from "@/components/controls";
import type { ParentCommunication, StudentContactStatus } from "@/lib/api";
import {
  User,
  Calendar,
  MessageCircle,
  FileText,
  Clock,
  Bell,
  Edit2,
  Trash2,
  Plus,
  ChevronRight,
  ChevronLeft,
  History,
} from "lucide-react";
import { getMethodIcon, getContactTypeIcon, getContactTypeColor } from "./contact-utils";
import Link from "next/link";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { TutorLink } from "@/components/tutors/TutorLink";

interface ContactDetailPanelProps {
  contact: ParentCommunication | null;
  // New props for student history mode
  studentContacts?: ParentCommunication[];
  selectedStudent?: StudentContactStatus;
  isLoadingHistory?: boolean;
  onContactSelect?: (contact: ParentCommunication) => void;
  onBack?: () => void;  // Back button to return to history list
  onEdit: (contact: ParentCommunication) => void;
  onDelete: (id: number) => void;
  onRecordNew: (studentId?: number) => void;
  showLocationPrefix?: boolean;
  /** When true, disables edit/delete/record buttons (Supervisor mode) */
  readOnly?: boolean;
}

export function ContactDetailPanel({
  contact,
  studentContacts,
  selectedStudent,
  isLoadingHistory,
  onContactSelect,
  onBack,
  onEdit,
  onDelete,
  onRecordNew,
  showLocationPrefix,
  readOnly = false,
}: ContactDetailPanelProps) {
  const formatContactDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Student History View - when a student is selected from the list
  if (selectedStudent && studentContacts) {
    return (
      <div className={cn(
        "flex flex-col h-full",
        "bg-white dark:bg-[#29241e] rounded-lg border border-line",
        "overflow-hidden"
      )}>
        {/* Header */}
        <div className="px-3 py-2 border-b border-line bg-tint">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
            Contact History
          </h3>
        </div>

        {/* Student Info */}
        <div className="px-4 py-3 border-b border-line/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-tint flex items-center justify-center">
              <User className="h-5 w-5 text-accent-ink" />
            </div>
            <div className="flex-1 min-w-0">
              <StudentInfoBadges
                student={{
                  student_id: selectedStudent.student_id,
                  student_name: selectedStudent.student_name,
                  school_student_id: selectedStudent.school_student_id || undefined,
                  grade: selectedStudent.grade || undefined,
                  lang_stream: selectedStudent.lang_stream || undefined,
                  school: selectedStudent.school || undefined,
                  home_location: selectedStudent.home_location || undefined,
                }}
                showLink
                showLocationPrefix={showLocationPrefix}
              />
            </div>
          </div>
        </div>

        {/* Contact List */}
        <div className="flex-1 overflow-y-auto">
          {isLoadingHistory ? (
            <div className="p-4 space-y-3">
              {/* Loading skeleton */}
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-3 animate-pulse">
                  <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
                      <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
                    </div>
                    <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded" />
                    <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : studentContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <History className="h-10 w-10 text-gray-300 dark:text-gray-400 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                No contact history
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Record your first contact with this student's parent
              </p>
            </div>
          ) : (
            <div className="divide-y divide-line/30">
              {studentContacts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onContactSelect?.(c)}
                  className={cn(
                    "w-full text-left px-4 py-3",
                    "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
                    "flex items-start gap-3"
                  )}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getMethodIcon(c.contact_method)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formatContactDate(c.contact_date)}
                      </span>
                      <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium", getContactTypeColor(c.contact_type))}>
                        {getContactTypeIcon(c.contact_type)}
                        {c.contact_type}
                      </span>
                    </div>
                    {c.brief_notes && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                        {c.brief_notes}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      by <TutorLink tutorId={c.tutor_id} tutorName={c.tutor_name} />
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-500 flex-shrink-0 mt-1" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-line bg-tint/50">
          <Button
            variant="primary"
            icon={Plus}
            className="w-full"
            onClick={() => onRecordNew(selectedStudent.student_id)}
            disabled={readOnly}
            title={readOnly ? "Read-only access" : undefined}
          >
            Record contact for {selectedStudent.student_name.split(' ')[0]}
          </Button>
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className={cn(
        "flex flex-col h-full",
        "bg-white dark:bg-[#29241e] rounded-lg border border-line",
        "overflow-hidden"
      )}>
        {/* Header */}
        <div className="px-3 py-2 border-b border-line bg-tint">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
            Contact Details
          </h3>
        </div>

        {/* Empty state */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <MessageCircle className="h-12 w-12 text-gray-300 dark:text-gray-400 mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Select a contact from the calendar to view details
          </p>
          {/* Secondary, because the page header already has the oak Record contact. */}
          <Button
            variant="secondary"
            icon={Plus}
            onClick={() => onRecordNew()}
            disabled={readOnly}
            title={readOnly ? "Read-only access" : undefined}
          >
            Record contact
          </Button>
        </div>
      </div>
    );
  }

  const contactDate = new Date(contact.contact_date);
  const formattedDate = contactDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = contactDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className={cn(
      "flex flex-col h-full",
      "bg-white dark:bg-[#29241e] rounded-lg border border-line",
      "overflow-hidden"
    )}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-line bg-tint">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onBack && (
              <IconButton label="Back to history" icon={ChevronLeft} size="sm" onClick={onBack} />
            )}
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
              Contact Details
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <IconButton
              label="Edit"
              icon={Edit2}
              size="sm"
              onClick={() => onEdit(contact)}
              disabled={readOnly}
              title={readOnly ? "Read-only access" : "Edit"}
            />
            <IconButton
              label="Delete"
              icon={Trash2}
              size="sm"
              tone="danger"
              onClick={() => onDelete(contact.id)}
              disabled={readOnly}
              title={readOnly ? "Read-only access" : "Delete"}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Student Info */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-accent-ink" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Student
            </span>
          </div>
          <div className="pl-6">
            <StudentInfoBadges
              student={{
                student_id: contact.student_id,
                student_name: contact.student_name,
                school_student_id: contact.school_student_id || undefined,
                grade: contact.grade || undefined,
                lang_stream: contact.lang_stream || undefined,
                school: contact.school || undefined,
                home_location: contact.home_location || undefined,
              }}
              showLink
              showLocationPrefix={showLocationPrefix}
            />
          </div>
        </div>

        {/* Contact Info */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-accent-ink" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Contact Date
            </span>
          </div>
          <div className="pl-6">
            <p className="text-sm text-gray-900 dark:text-gray-100">{formattedDate}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{formattedTime}</p>
          </div>
        </div>

        {/* Method & Type */}
        <div className="flex gap-4">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              {getMethodIcon(contact.contact_method)}
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Method
              </span>
            </div>
            <p className="pl-6 text-sm text-gray-900 dark:text-gray-100">
              {contact.contact_method}
            </p>
          </div>
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-accent-ink" />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Type
              </span>
            </div>
            <div className="pl-6">
              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", getContactTypeColor(contact.contact_type))}>
                {getContactTypeIcon(contact.contact_type)}
                {contact.contact_type}
              </span>
            </div>
          </div>
        </div>

        {/* Contacted By */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-accent-ink" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Contacted By
            </span>
          </div>
          <p className="pl-6 text-sm text-gray-900 dark:text-gray-100">
            <TutorLink tutorId={contact.tutor_id} tutorName={contact.tutor_name} />
          </p>
        </div>

        {/* Notes */}
        {contact.brief_notes && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-accent-ink" />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Notes
              </span>
            </div>
            <div className="pl-6">
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-800/50 rounded-md p-2">
                {contact.brief_notes}
              </p>
            </div>
          </div>
        )}

        {/* Follow-up */}
        {contact.follow_up_needed && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                Follow-up Scheduled
              </span>
            </div>
            <div className="pl-6">
              {contact.follow_up_date ? (
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  {new Date(contact.follow_up_date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic">No date set</p>
              )}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Clock className="h-3 w-3" />
            Created {new Date(contact.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
            {contact.created_by && <> by {contact.created_by.split('@')[0]}</>}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-line bg-tint/50">
        <Button
          icon={Plus}
          className="w-full"
          onClick={() => onRecordNew(contact.student_id)}
          disabled={readOnly}
          title={readOnly ? "Read-only access" : undefined}
        >
          Record new contact for {contact.student_name.split(' ')[0]}
        </Button>
      </div>
    </div>
  );
}
