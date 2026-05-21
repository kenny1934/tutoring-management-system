"use client";

import { useEffect, useState } from "react";
import { X, Bell } from "lucide-react";
import type {
  ContactMethod,
  ContactType,
  ParentContact,
  Student,
} from "@/lib/types";
import { CONTACT_METHODS, CONTACT_TYPES, MethodIcon } from "./contact-utils";
import { hktDateFromIso, hktTimeFromIso } from "@/lib/datetime";

type Props = {
  open: boolean;
  students: Student[];
  preselectStudentId: string | null;
  editing: ParentContact | null;
  onClose: () => void;
  onSave: (input: Omit<ParentContact, "id"> & { id?: string }) => void;
};

export function RecordContactModal({
  open,
  students,
  preselectStudentId,
  editing,
  onClose,
  onSave,
}: Props) {
  const [studentId, setStudentId] = useState<string>(
    preselectStudentId ?? students[0].id
  );
  const [method, setMethod] = useState<ContactMethod>("WhatsApp");
  const [type, setType] = useState<ContactType>("Progress Update");
  const [contactedDate, setContactedDate] = useState("2026-05-19");
  const [contactedTime, setContactedTime] = useState("09:00");
  const [briefNotes, setBriefNotes] = useState("");
  const [followUpNeeded, setFollowUpNeeded] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setStudentId(editing.studentId);
      setMethod(editing.method);
      setType(editing.type);
      setContactedDate(hktDateFromIso(editing.contactedAt));
      setContactedTime(hktTimeFromIso(editing.contactedAt));
      setBriefNotes(editing.briefNotes);
      setFollowUpNeeded(editing.followUpNeeded);
      setFollowUpDate(editing.followUpDate ?? "");
    } else {
      setStudentId(preselectStudentId ?? students[0].id);
      setMethod("WhatsApp");
      setType("Progress Update");
      setContactedDate("2026-05-19");
      setContactedTime("09:00");
      setBriefNotes("");
      setFollowUpNeeded(false);
      setFollowUpDate("");
    }
  }, [open, editing, preselectStudentId, students]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

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
      onClick={onClose}
    >
      <div
        className="surface w-full sm:max-w-xl bg-white max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
          <div className="text-lg font-semibold text-ink-900">
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
