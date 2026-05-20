"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { Bell, Plus } from "lucide-react";
import type { ParentContact } from "@/lib/types";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { contactStatusFor } from "@/lib/mock-data/parent-contacts";
import { ContactStatusBadge } from "@/components/comms/ContactStatusBadge";
import {
  MethodIcon,
  TypeIcon,
  typeBadgeCls,
} from "@/components/comms/contact-utils";

export function StudentParentCommsTab() {
  const { id } = useParams<{ id: string }>();
  const { contacts } = usePrimaryStore();

  const studentContacts = useMemo(
    () =>
      contacts
        .filter((c) => c.studentId === id)
        .sort((a, b) => b.contactedAt.localeCompare(a.contactedAt)),
    [contacts, id]
  );

  const status = contactStatusFor(id, contacts);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ContactStatusBadge status={status} size="sm" />
          <span className="text-xs text-ink-500">
            {studentContacts.length}{" "}
            {studentContacts.length === 1 ? "record" : "records"}
          </span>
        </div>
        <button
          type="button"
          className="text-sm rounded-md bg-ink-800 text-white px-3 py-1.5 hover:bg-ink-900 flex items-center gap-1 font-medium"
          onClick={() =>
            alert(
              "Demo only. In production this opens the Record Contact modal."
            )
          }
        >
          <Plus className="h-4 w-4" />
          Record contact
        </button>
      </div>

      {studentContacts.length === 0 ? (
        <div className="surface p-10 text-center text-sm text-ink-500">
          No contacts recorded for this student yet.
        </div>
      ) : (
        <div className="space-y-2">
          {studentContacts.map((c) => (
            <ContactCard key={c.id} contact={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function ContactCard({ contact: c }: { contact: ParentContact }) {
  const when = new Date(c.contactedAt).toLocaleString("en-HK", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <div className="surface p-4 text-sm space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <MethodIcon method={c.method} className="h-4 w-4" />
          <span
            className={`text-xs rounded-md px-1.5 py-0.5 flex items-center gap-1 ${typeBadgeCls(
              c.type
            )}`}
          >
            <TypeIcon type={c.type} />
            {c.type}
          </span>
          <span className="text-xs text-ink-500 truncate">
            by {c.tutorName}
          </span>
        </div>
        <span className="text-xs text-ink-500 tabular-nums">{when}</span>
      </div>

      <div className="text-sm text-ink-800 whitespace-pre-wrap">
        {c.briefNotes}
      </div>

      {c.followUpNeeded && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs">
          <div className="font-semibold text-amber-800 flex items-center gap-1.5">
            <Bell className="h-3 w-3" />
            Follow-up
          </div>
          <div className="text-amber-700 mt-0.5">
            {c.followUpDone
              ? "Marked done"
              : `Due ${c.followUpDate ?? "TBD"}`}
          </div>
        </div>
      )}
    </div>
  );
}
