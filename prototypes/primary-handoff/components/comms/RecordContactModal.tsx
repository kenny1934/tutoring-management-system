"use client";

import { useRef, useState } from "react";
import { X, Bell } from "lucide-react";
import type {
  ContactMethod,
  ContactType,
  ParentContact,
  Student,
} from "@/lib/types";
import { CONTACT_METHODS, CONTACT_TYPES, MethodIcon } from "./contact-utils";
import { hktDateFromIso, hktTimeFromIso } from "@/lib/datetime";
import { useModalA11y } from "@/lib/useModalA11y";

type Props = {
  open: boolean;
  students: Student[];
  preselectStudentId: string | null;
  editing: ParentContact | null;
  onClose: () => void;
  onSave: (input: Omit<ParentContact, "id"> & { id?: string }) => void;
};

// Gate: mount the modal (and its focus/escape handling) only while open, and
// remount when the target contact/student changes so the form re-seeds.
export function RecordContactModal({ open, ...rest }: Props) {
  if (!open) return null;
  return (
    <RecordContactModalInner
      key={rest.editing?.id ?? rest.preselectStudentId ?? "new"}
      {...rest}
    />
  );
}

function RecordContactModalInner({
  students,
  preselectStudentId,
  editing,
  onClose,
  onSave,
}: Omit<Props, "open">) {
  const defaults = {
    studentId: editing?.studentId ?? preselectStudentId ?? students[0]?.id ?? "",
    method: editing?.method ?? ("WhatsApp" as ContactMethod),
    type: editing?.type ?? ("Progress Update" as ContactType),
    contactedDate: editing ? hktDateFromIso(editing.contactedAt) : "2026-05-19",
    contactedTime: editing ? hktTimeFromIso(editing.contactedAt) : "09:00",
    briefNotes: editing?.briefNotes ?? "",
    followUpNeeded: editing?.followUpNeeded ?? false,
    followUpDate: editing?.followUpDate ?? "",
  };

  const [studentId, setStudentId] = useState(defaults.studentId);
  const [method, setMethod] = useState<ContactMethod>(defaults.method);
  const [type, setType] = useState<ContactType>(defaults.type);
  const [contactedDate, setContactedDate] = useState(defaults.contactedDate);
  const [contactedTime, setContactedTime] = useState(defaults.contactedTime);
  const [briefNotes, setBriefNotes] = useState(defaults.briefNotes);
  const [followUpNeeded, setFollowUpNeeded] = useState(defaults.followUpNeeded);
  const [followUpDate, setFollowUpDate] = useState(defaults.followUpDate);

  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Backdrop click only closes when nothing has changed, so in-flight input
  // isn't discarded; the Cancel/Close button always closes.
  const isPristine =
    studentId === defaults.studentId &&
    method === defaults.method &&
    type === defaults.type &&
    contactedDate === defaults.contactedDate &&
    contactedTime === defaults.contactedTime &&
    briefNotes === defaults.briefNotes &&
    followUpNeeded === defaults.followUpNeeded &&
    followUpDate === defaults.followUpDate;

  const { dialogRef, onKeyDownTrap, onBackdropClick } = useModalA11y({
    onClose,
    isPristine,
    initialFocusRef: notesRef,
  });

  const submit = () => {
    const contactedAt = new Date(
      `${contactedDate}T${contactedTime}:00+08:00`
    ).toISOString();
    onSave({
      id: editing?.id,
      studentId,
      tutorName: editing?.tutorName ?? "Ms Wendy Wong",
      method,
      type,
      contactedAt,
      briefNotes,
      followUpNeeded,
      followUpDate: followUpNeeded ? followUpDate || undefined : undefined,
      followUpDone: editing?.followUpDone ?? false,
    });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-ink-900/40 p-0 sm:p-4"
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-contact-title"
        tabIndex={-1}
        onKeyDown={onKeyDownTrap}
        className="surface w-full sm:max-w-xl bg-white max-h-[92vh] overflow-y-auto outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
          <div id="record-contact-title" className="text-lg font-semibold text-ink-900">
            {editing ? "Edit contact" : "Record contact"}
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 -mr-2 p-2"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {students.length === 0 ? (
          <>
            <div className="p-5">
              <div className="surface-muted text-sm text-ink-600 text-center p-6">
                No students available to record a contact for. Add a student
                first, then try again.
              </div>
            </div>
            <footer className="border-t border-ink-200 px-5 py-3 bg-ink-50 flex items-center justify-end">
              <button
                onClick={onClose}
                className="rounded-md border border-ink-300 text-ink-700 px-3 py-1.5 text-sm hover:bg-white"
              >
                Close
              </button>
            </footer>
          </>
        ) : (
          <>
        <div className="p-5 space-y-4">
          <Field label="Student">
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm bg-white"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.code} · {s.grade}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Method">
            <div className="flex flex-wrap gap-1.5">
              {CONTACT_METHODS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`text-sm rounded-md px-3 py-1.5 border flex items-center gap-1.5 ${
                    method === m
                      ? "bg-ink-800 border-ink-800 text-white"
                      : "border-ink-200 text-ink-700 hover:bg-ink-50"
                  }`}
                >
                  <MethodIcon
                    method={m}
                    className={`h-4 w-4 ${method === m ? "text-white" : ""}`}
                  />
                  {m}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Type">
            <div className="flex flex-wrap gap-1.5">
              {CONTACT_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`text-sm rounded-md px-3 py-1.5 border ${
                    type === t
                      ? "bg-ink-800 border-ink-800 text-white"
                      : "border-ink-200 text-ink-700 hover:bg-ink-50"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input
                type="date"
                value={contactedDate}
                onChange={(e) => setContactedDate(e.target.value)}
                className="w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm"
              />
            </Field>
            <Field label="Time">
              <input
                type="time"
                value={contactedTime}
                onChange={(e) => setContactedTime(e.target.value)}
                className="w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm"
              />
            </Field>
          </div>

          <Field label="Brief notes">
            <textarea
              ref={notesRef}
              value={briefNotes}
              onChange={(e) => setBriefNotes(e.target.value)}
              rows={4}
              placeholder="What was discussed, what was agreed"
              className="w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm resize-none"
            />
          </Field>

          <div className="border-t border-ink-100 pt-3">
            <label className="flex items-center gap-2 text-sm text-ink-800">
              <input
                type="checkbox"
                checked={followUpNeeded}
                onChange={(e) => setFollowUpNeeded(e.target.checked)}
                className="rounded"
              />
              <Bell className="h-4 w-4 text-amber-600" />
              Follow-up needed
            </label>
            {followUpNeeded && (
              <div className="mt-2 ml-6">
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="rounded-md border border-ink-200 px-3 py-1.5 text-sm"
                />
              </div>
            )}
          </div>
        </div>

        <footer className="border-t border-ink-200 px-5 py-3 bg-ink-50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-ink-300 text-ink-700 px-3 py-1.5 text-sm hover:bg-white"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!briefNotes.trim()}
            className="rounded-md bg-mc-red-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-mc-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {editing ? "Save changes" : "Record"}
          </button>
        </footer>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-ink-500 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
