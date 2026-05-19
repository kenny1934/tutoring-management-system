"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type {
  ContactType,
  ParentContact,
  Student,
} from "@/lib/types";
import {
  contactStatusFor,
  DEMO_NOW,
} from "@/lib/mock-data/parent-contacts";
import { ContactStatsBar } from "./ContactStatsBar";
import { PendingFollowups } from "./PendingFollowups";
import { StudentList } from "./StudentList";
import { ContactCalendar } from "./ContactCalendar";
import { ContactDetail } from "./ContactDetail";
import { RecordContactModal } from "./RecordContactModal";

type Props = {
  students: Student[];
  initialContacts: ParentContact[];
};

export function ParentContactsApp({ students, initialContacts }: Props) {
  const [contacts, setContacts] = useState(initialContacts);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    null
  );
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );
  const [search, setSearch] = useState("");
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordPreselectStudent, setRecordPreselectStudent] = useState<
    string | null
  >(null);
  const [editing, setEditing] = useState<ParentContact | null>(null);
  const [activeTypes, setActiveTypes] = useState<Set<ContactType>>(
    new Set(["Progress Update", "Concern", "General"])
  );

  const studentById = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students]
  );

  const student = selectedStudentId
    ? studentById.get(selectedStudentId) ?? null
    : null;

  const studentContacts = useMemo(
    () =>
      selectedStudentId
        ? contacts.filter((c) => c.studentId === selectedStudentId)
        : [],
    [contacts, selectedStudentId]
  );

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) ?? null,
    [contacts, selectedContactId]
  );

  // Stats
  const now = new Date(DEMO_NOW).getTime();
  const weekAgo = now - 7 * 86400000;
  const stats = {
    total: contacts.length,
    thisWeek: contacts.filter(
      (c) => new Date(c.contactedAt).getTime() >= weekAgo
    ).length,
    pendingFollowups: contacts.filter((c) => c.followUpNeeded && !c.followUpDone)
      .length,
    needingContact: students.filter(
      (s) => contactStatusFor(s.id, contacts) === "Contact Needed"
    ).length,
  };

  const handleSelectStudent = (id: string) => {
    setSelectedStudentId(id);
    setSelectedContactId(null);
  };

  const handleSelectContact = (id: string) => {
    setSelectedContactId(id);
    const c = contacts.find((c) => c.id === id);
    if (c) setSelectedStudentId(c.studentId);
  };

  const handleRecord = (studentId?: string) => {
    setEditing(null);
    setRecordPreselectStudent(studentId ?? selectedStudentId ?? null);
    setRecordOpen(true);
  };

  const handleEdit = (c: ParentContact) => {
    setEditing(c);
    setRecordPreselectStudent(c.studentId);
    setRecordOpen(true);
  };

  const handleSave = (
    input: Omit<ParentContact, "id"> & { id?: string }
  ) => {
    if (input.id) {
      setContacts((prev) =>
        prev.map((c) =>
          c.id === input.id ? ({ ...input, id: input.id } as ParentContact) : c
        )
      );
    } else {
      const newC: ParentContact = {
        ...input,
        id: `pc-${Math.random().toString(36).slice(2, 8)}`,
      };
      setContacts((prev) => [...prev, newC]);
    }
    setRecordOpen(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this contact record? Demo only.")) return;
    setContacts((prev) => prev.filter((c) => c.id !== id));
    if (selectedContactId === id) setSelectedContactId(null);
  };

  const handleMarkFollowUpDone = (id: string) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, followUpDone: true } : c))
    );
  };

  const toggleType = (t: ContactType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        if (next.size > 1) next.delete(t);
      } else {
        next.add(t);
      }
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => handleRecord()}
          className="rounded-md bg-accent-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-accent-700 flex items-center gap-1"
        >
          <Plus className="h-4 w-4" />
          Record contact
        </button>
      </div>

      <ContactStatsBar {...stats} />

      <PendingFollowups
        contacts={contacts}
        students={students}
        onRecord={(id) => handleRecord(id)}
        onMarkDone={handleMarkFollowUpDone}
        onSelectStudent={handleSelectStudent}
      />

      <div className="grid gap-3 lg:grid-cols-[280px_1fr_360px] h-[640px]">
        <div className="min-h-0">
          <StudentList
            students={students}
            contacts={contacts}
            selectedStudentId={selectedStudentId}
            onSelectStudent={handleSelectStudent}
            onRecord={(id) => handleRecord(id)}
            search={search}
            onSearch={setSearch}
          />
        </div>
        <div className="min-h-0">
          <ContactCalendar
            contacts={contacts}
            selectedContactId={selectedContactId}
            onSelectContact={handleSelectContact}
            activeTypes={activeTypes}
            onToggleType={toggleType}
          />
        </div>
        <div className="min-h-0">
          <ContactDetail
            student={student}
            contacts={studentContacts}
            selectedContact={selectedContact}
            onSelectContact={handleSelectContact}
            onRecord={(id) => handleRecord(id)}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>
      </div>

      <RecordContactModal
        open={recordOpen}
        students={students}
        preselectStudentId={recordPreselectStudent}
        editing={editing}
        onClose={() => setRecordOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}
