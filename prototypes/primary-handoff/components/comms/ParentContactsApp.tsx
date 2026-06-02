"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import type { ContactType, ParentContact } from "@/lib/types";
import {
  contactStatusFor,
  DEMO_NOW,
} from "@/lib/mock-data/parent-contacts";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { newId } from "@/lib/id";
import { ContactStatsBar } from "./ContactStatsBar";
import { PendingFollowups } from "./PendingFollowups";
import { StudentList } from "./StudentList";
import { ContactCalendar } from "./ContactCalendar";
import { ContactDetail } from "./ContactDetail";
import { RecordContactModal } from "./RecordContactModal";

// useSearchParams (for the ?student=<id> deep link) must sit inside a
// Suspense boundary in Next 15. The comms page renders <ParentContactsApp />
// directly, so we provide the boundary here rather than at the page.
export function ParentContactsApp() {
  return (
    <Suspense fallback={null}>
      <ParentContactsAppInner />
    </Suspense>
  );
}

function ParentContactsAppInner() {
  const { students, contacts, setContacts } = usePrimaryStore();
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

  const searchParams = useSearchParams();
  const studentParam = searchParams.get("student");

  const studentById = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students]
  );

  // Deep-link: honour ?student=<id> (e.g. dashboard follow-ups link to
  // /comms?student=s-002) by selecting that student on load / param change.
  useEffect(() => {
    if (studentParam && studentById.has(studentParam)) {
      setSelectedStudentId(studentParam);
      setSelectedContactId(null);
    }
  }, [studentParam, studentById]);

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
        id: newId("pc"),
      };
      setContacts((prev) => [...prev, newC]);
    }
    setRecordOpen(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this contact record?")) return;
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
          className="rounded-md bg-mc-red-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-mc-red-700 flex items-center gap-1"
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

      <div className="grid gap-3 lg:grid-cols-[280px_1fr_360px] lg:h-[640px]">
        <div className="min-h-[320px] lg:min-h-0">
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
        <div className="min-h-[360px] lg:min-h-0">
          <ContactCalendar
            contacts={contacts}
            studentById={studentById}
            selectedContactId={selectedContactId}
            onSelectContact={handleSelectContact}
            activeTypes={activeTypes}
            onToggleType={toggleType}
          />
        </div>
        <div className="min-h-[320px] lg:min-h-0 flex flex-col gap-2">
          {student && selectedContact && (
            <button
              onClick={() => setSelectedContactId(null)}
              className="self-start inline-flex items-center gap-1 text-sm text-ink-600 hover:text-ink-900 rounded-md border border-ink-200 bg-white px-2.5 py-1 hover:bg-ink-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to {student.name}&rsquo;s history
            </button>
          )}
          <div className="min-h-0 flex-1">
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
