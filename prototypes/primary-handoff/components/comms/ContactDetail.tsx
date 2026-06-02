"use client";

import Link from "next/link";
import { Pencil, Trash2, Plus, Bell, ArrowUpRight } from "lucide-react";
import type { ParentContact, Student } from "@/lib/types";
import { ContactStatusBadge } from "./ContactStatusBadge";
import { MethodIcon, TypeIcon, typeBadgeCls } from "./contact-utils";
import { contactStatusFor } from "@/lib/mock-data/parent-contacts";

type Props = {
  student: Student | null;
  contacts: ParentContact[]; // for student
  selectedContact: ParentContact | null;
  onSelectContact: (id: string) => void;
  onRecord: (studentId: string) => void;
  onEdit: (c: ParentContact) => void;
  onDelete: (id: string) => void;
};

export function ContactDetail({
  student,
  contacts,
  selectedContact,
  onSelectContact,
  onRecord,
  onEdit,
  onDelete,
}: Props) {
  if (!student && !selectedContact) {
    return (
      <div className="surface h-full grid place-items-center text-center p-6">
        <div className="text-sm text-ink-500 max-w-xs">
          Pick a student on the left to see their contact history, or click an
          event in the calendar to view a single record.
        </div>
      </div>
    );
  }

  if (selectedContact && !student) {
    return (
      <div className="surface h-full overflow-hidden flex flex-col">
        <SingleContactPanel
          contact={selectedContact}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    );
  }

  // Student view (with optional drilled-into contact)
  if (!student) return null;

  const status = contactStatusFor(student.id, contacts);

  return (
    <div className="surface h-full flex flex-col overflow-hidden">
      <div className="border-b border-ink-200 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/students/${student.id}`}
              className="font-semibold text-ink-900 truncate hover:underline inline-flex items-center gap-1"
              title="Open student hub"
            >
              {student.name}
              <ArrowUpRight className="h-3 w-3 text-ink-400" />
            </Link>
            <div className="text-xs text-ink-500 truncate">
              {student.code} · {student.grade} · {student.school}
            </div>
          </div>
          <ContactStatusBadge status={status} size="sm" />
        </div>
        <div className="mt-2">
          <button
            onClick={() => onRecord(student.id)}
            className="text-sm rounded-md bg-mc-red-600 text-white px-3 py-1.5 hover:bg-mc-red-700 flex items-center gap-1 font-medium"
          >
            <Plus className="h-4 w-4" />
            Record contact
          </button>
        </div>
      </div>

      {selectedContact ? (
        <SingleContactPanel
          contact={selectedContact}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {contacts.length === 0 && (
            <div className="text-sm text-ink-500 text-center py-8">
              No contacts recorded yet.
            </div>
          )}
          {contacts
            .slice()
            .sort((a, b) => b.contactedAt.localeCompare(a.contactedAt))
            .map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectContact(c.id)}
                className="w-full text-left bg-white border border-ink-200 rounded-md p-3 text-sm hover:border-ink-400"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MethodIcon method={c.method} className="h-3.5 w-3.5" />
                    <span
                      className={`text-xs rounded-md px-1.5 py-0.5 flex items-center gap-1 ${typeBadgeCls(c.type)}`}
                    >
                      <TypeIcon type={c.type} />
                      {c.type}
                    </span>
                  </div>
                  <span className="text-xs text-ink-500">
                    {new Date(c.contactedAt).toLocaleDateString("en-HK", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="text-xs text-ink-600 mt-1.5 line-clamp-2">
                  {c.briefNotes}
                </div>
                {c.followUpNeeded && !c.followUpDone && (
                  <div className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                    <Bell className="h-3 w-3" />
                    Follow-up due {c.followUpDate ?? "TBD"}
                  </div>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function SingleContactPanel({
  contact,
  onEdit,
  onDelete,
}: {
  contact: ParentContact;
  onEdit: (c: ParentContact) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MethodIcon method={contact.method} />
          <span
            className={`text-xs rounded-md px-2 py-0.5 flex items-center gap-1 ${typeBadgeCls(contact.type)}`}
          >
            <TypeIcon type={contact.type} />
            {contact.type}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onEdit(contact)}
            className="p-1.5 text-ink-500 hover:text-ink-900 hover:bg-ink-100 rounded-md"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(contact.id)}
            className="p-1.5 text-ink-500 hover:text-rose-600 hover:bg-rose-50 rounded-md"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="text-xs text-ink-500">
        By {contact.tutorName} ·{" "}
        {new Date(contact.contactedAt).toLocaleString("en-HK", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </div>

      <div className="text-sm text-ink-800 whitespace-pre-wrap surface-muted p-3">
        {contact.briefNotes}
      </div>

      {contact.followUpNeeded && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
            <Bell className="h-3 w-3" />
            Follow-up
          </div>
          <div className="text-xs text-amber-700 mt-0.5">
            {contact.followUpDone
              ? "Marked done"
              : `Due ${contact.followUpDate ?? "TBD"}`}
          </div>
        </div>
      )}
    </div>
  );
}
