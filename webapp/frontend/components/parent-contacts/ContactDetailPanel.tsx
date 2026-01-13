"use client";

import { cn } from "@/lib/utils";
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
  onRecordNew: () => void;
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
        "bg-white dark:bg-[#1a1a1a] rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]",
        "overflow-hidden"
      )}>
        {/* Header */}
        <div className="px-3 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628]">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
            Contact History
          </h3>
        </div>

        {/* Student Info */}
        <div className="px-4 py-3 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#f5ede3] dark:bg-[#3d3628] flex items-center justify-center">
              <User className="h-5 w-5 text-[#a0704b]" />
            </div>
            <div className="flex-1 min-w-0">
              <Link
                href={`/students/${selectedStudent.student_id}`}
                className="text-base font-semibold text-[#a0704b] dark:text-[#cd853f] hover:underline"
              >
                {selectedStudent.student_name}
              </Link>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                {selectedStudent.school_student_id && <span>{selectedStudent.school_student_id}</span>}
                {selectedStudent.grade && <span>· {selectedStudent.grade}</span>}
              </div>
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
              <History className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                No contact history
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Record your first contact with this student's parent
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#e8d4b8]/30 dark:divide-[#6b5a4a]/30">
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
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      by {c.tutor_name}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0 mt-1" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3]/50 dark:bg-[#3d3628]/50">
          <button
            onClick={onRecordNew}
            className={cn(
              "w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium",
              "bg-[#a0704b] dark:bg-[#8b6f47] text-white",
              "hover:bg-[#8b5d3b] dark:hover:bg-[#7a5f3a] transition-colors"
            )}
          >
            <Plus className="h-4 w-4" />
            Record Contact for {selectedStudent.student_name.split(' ')[0]}
          </button>
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className={cn(
        "flex flex-col h-full",
        "bg-white dark:bg-[#1a1a1a] rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]",
        "overflow-hidden"
      )}>
        {/* Header */}
        <div className="px-3 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628]">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
            Contact Details
          </h3>
        </div>

        {/* Empty state */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <MessageCircle className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Select a contact from the calendar to view details
          </p>
          <button
            onClick={onRecordNew}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium",
              "bg-[#a0704b] dark:bg-[#8b6f47] text-white",
              "hover:bg-[#8b5d3b] dark:hover:bg-[#7a5f3a] transition-colors"
            )}
          >
            <Plus className="h-4 w-4" />
            Record Contact
          </button>
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
      "bg-white dark:bg-[#1a1a1a] rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]",
      "overflow-hidden"
    )}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1 rounded hover:bg-white dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400 hover:text-[#a0704b]"
                title="Back to history"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
              Contact Details
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(contact)}
              className="p-1.5 rounded hover:bg-white dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400 hover:text-[#a0704b]"
              title="Edit"
            >
              <Edit2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => onDelete(contact.id)}
              className="p-1.5 rounded hover:bg-white dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400 hover:text-red-500"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Student Info */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-[#a0704b]" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Student
            </span>
          </div>
          <div className="pl-6">
            <Link
              href={`/students/${contact.student_id}`}
              className="text-base font-semibold text-[#a0704b] dark:text-[#cd853f] hover:underline"
            >
              {contact.student_name}
            </Link>
            {contact.school_student_id && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ID: {contact.school_student_id}
              </p>
            )}
            {contact.grade && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Grade: {contact.grade}
              </p>
            )}
          </div>
        </div>

        {/* Contact Info */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#a0704b]" />
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
              <MessageCircle className="h-4 w-4 text-[#a0704b]" />
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
            <User className="h-4 w-4 text-[#a0704b]" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Contacted By
            </span>
          </div>
          <p className="pl-6 text-sm text-gray-900 dark:text-gray-100">
            {contact.tutor_name}
          </p>
        </div>

        {/* Notes */}
        {contact.brief_notes && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#a0704b]" />
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
              <Bell className="h-4 w-4 text-blue-500" />
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
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
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
      <div className="px-4 py-3 border-t border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3]/50 dark:bg-[#3d3628]/50">
        <button
          onClick={onRecordNew}
          className={cn(
            "w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium",
            "bg-white dark:bg-[#2d2618] border border-[#d4a574] dark:border-[#8b6f47]",
            "text-[#a0704b] dark:text-[#cd853f]",
            "hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
          )}
        >
          <Plus className="h-4 w-4" />
          Record New Contact for {contact.student_name.split(' ')[0]}
        </button>
      </div>
    </div>
  );
}
