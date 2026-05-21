"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import {
  CalendarClock,
  ClipboardList,
  History,
  MessageSquare,
  ArrowRight,
} from "lucide-react";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { DEMO_DAY } from "@/lib/mock-data/sessions";
import { SessionStatus } from "@/lib/types";
import type { ChecktableAssignment, ParentContact, Session } from "@/lib/types";
import { daysAgoLabel, formatSessionTime, getNextSession } from "./student-utils";

export function StudentOverview() {
  const { id } = useParams<{ id: string }>();
  const { students, sessions, assignments, contacts, itemMeta } =
    usePrimaryStore();

  const student = students.find((s) => s.id === id);
  // Parent shell calls notFound() for an unknown id, so this is defensive.
  const next = useMemo(
    () => (student ? getNextSession(student.id, sessions, DEMO_DAY) : null),
    [student, sessions]
  );
  if (!student) return null;

  const pending = useMemo(
    () =>
      assignments
        .filter((a) => a.studentId === student.id && a.status === "assigned")
        .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt)),
    [assignments, student.id]
  );

  const recentDone = useMemo(
    () =>
      assignments
        .filter(
          (a) => a.studentId === student.id && a.status === "done" && a.doneAt
        )
        .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "")),
    [assignments, student.id]
  );

  const recentAttended = useMemo(
    () =>
      sessions
        .filter(
          (s) =>
            s.student_id === student.id &&
            s.session_date < DEMO_DAY &&
            (s.session_status === SessionStatus.ATTENDED ||
              s.session_status === SessionStatus.ATTENDED_MAKEUP)
        )
        .sort((a, b) => b.session_date.localeCompare(a.session_date)),
    [sessions, student.id]
  );

  const recentComms = useMemo(
    () =>
      contacts
        .filter((c) => c.studentId === student.id)
        .sort((a, b) => b.contactedAt.localeCompare(a.contactedAt)),
    [contacts, student.id]
  );

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <Card
        icon={<CalendarClock className="h-4 w-4 text-mc-red-600" />}
        title="Next session"
        actionLabel={next ? "Open session" : undefined}
        actionHref={next ? `/sessions?session=${next.id}` : undefined}
      >
        {next ? (
          <NextSessionBody session={next} />
        ) : (
          <EmptyLine>No upcoming sessions scheduled.</EmptyLine>
        )}
      </Card>

      <Card
        icon={<ClipboardList className="h-4 w-4 text-amber-600" />}
        title={`Pending HW (${pending.length})`}
        actionLabel="Open Checktables"
        actionHref={`/students/${student.id}/checktables`}
      >
        {pending.length === 0 ? (
          <EmptyLine>Nothing pending.</EmptyLine>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {pending.slice(0, 5).map((a) => (
              <PendingRow
                key={a.id}
                assignment={a}
                itemCode={itemMeta.get(a.itemId)?.item.code ?? a.itemId}
              />
            ))}
            {pending.length > 5 && (
              <li className="text-xs text-ink-500">
                +{pending.length - 5} more
              </li>
            )}
          </ul>
        )}
      </Card>

      <Card
        icon={<History className="h-4 w-4 text-ink-600" />}
        title="Recent activity"
        actionLabel="Full history"
        actionHref={`/students/${student.id}/history`}
      >
        <ul className="space-y-1.5 text-sm">
          {recentDone.slice(0, 2).map((a) => (
            <li
              key={a.id}
              className="text-ink-700 flex items-center gap-2 min-w-0"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="truncate">
                Marked{" "}
                <span className="font-mono text-xs">
                  {itemMeta.get(a.itemId)?.item.code ?? a.itemId}
                </span>{" "}
                done
              </span>
              <span className="text-xs text-ink-400 ml-auto shrink-0">
                {a.doneAt
                  ? daysAgoLabel(a.doneAt.slice(0, 10), DEMO_DAY)
                  : ""}
              </span>
            </li>
          ))}
          {recentAttended.slice(0, 2).map((s) => (
            <li
              key={s.id}
              className="text-ink-700 flex items-center gap-2 min-w-0"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-ink-400 shrink-0" />
              <span className="truncate">
                Attended {formatSessionTime(s)}
              </span>
              <span className="text-xs text-ink-400 ml-auto shrink-0">
                {daysAgoLabel(s.session_date, DEMO_DAY)}
              </span>
            </li>
          ))}
          {recentDone.length + recentAttended.length === 0 && (
            <EmptyLine>No recent activity.</EmptyLine>
          )}
        </ul>
      </Card>

      <Card
        icon={<MessageSquare className="h-4 w-4 text-ink-600" />}
        title="Parent comms"
        actionLabel="Open thread"
        actionHref={`/students/${student.id}/parent-comms`}
      >
        {recentComms.length === 0 ? (
          <EmptyLine>No contact logged yet.</EmptyLine>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {recentComms.slice(0, 3).map((c) => (
              <CommsRow key={c.id} contact={c} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Card({
  icon,
  title,
  actionLabel,
  actionHref,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  actionLabel?: string;
  actionHref?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-2.5">
        {icon}
        <span className="text-sm font-semibold text-ink-900">{title}</span>
      </div>
      <div className="flex-1">{children}</div>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="text-xs text-mc-red-700 hover:underline inline-flex items-center gap-1 mt-3 self-start"
        >
          {actionLabel}
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-ink-400 italic">{children}</div>;
}

function NextSessionBody({ session }: { session: Session }) {
  return (
    <div className="text-sm text-ink-700 space-y-0.5">
      <div className="font-medium text-ink-900">{formatSessionTime(session)}</div>
      <div className="text-ink-600">{session.tutor_name}</div>
      {session.room && (
        <div className="text-xs text-ink-500">{session.room}</div>
      )}
    </div>
  );
}

function PendingRow({
  assignment,
  itemCode,
}: {
  assignment: ChecktableAssignment;
  itemCode: string;
}) {
  return (
    <li className="flex items-center gap-2 min-w-0">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
      <span className="font-mono text-xs text-ink-700">{itemCode}</span>
      {assignment.pageRange && (
        <span className="text-xs text-ink-500">pp. {assignment.pageRange}</span>
      )}
      {assignment.sessionLabel && (
        <span className="text-xs text-ink-400 ml-auto shrink-0 truncate">
          {assignment.sessionLabel}
        </span>
      )}
    </li>
  );
}

function CommsRow({ contact }: { contact: ParentContact }) {
  const when = daysAgoLabel(contact.contactedAt.slice(0, 10), DEMO_DAY);
  return (
    <li className="text-ink-700 min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-ink-500">{contact.method}</span>
        <span className="text-xs text-ink-400">·</span>
        <span className="text-xs text-ink-500 truncate">{contact.type}</span>
        <span className="text-xs text-ink-400 ml-auto shrink-0">{when}</span>
      </div>
      <div className="text-xs text-ink-600 truncate">{contact.briefNotes}</div>
    </li>
  );
}
