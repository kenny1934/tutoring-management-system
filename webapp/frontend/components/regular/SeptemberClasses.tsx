"use client";

import { CalendarDays, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { StudentCodeBadge } from "@/components/summer/prospect-badges";
import { StudentLink } from "@/components/admin/RegularRetentionSections";
import { regularStatusLabel } from "@/lib/regular-utils";
import type { RegularMyClassResponse, RegularMyClassSlot, RegularMyClassStudent } from "@/types";

/** Who is coming to a tutor's classes in September.
 *
 *  The forward-looking half of renewal. The chasing tab looks back at the
 *  students they taught last year and asks who has not come back; this looks
 *  at the slots they are down to teach and says who has been placed in them.
 *  The two populations differ on purpose. A class fills up with families the
 *  tutor has never met, and some of last year's students end up with somebody
 *  else. */
export function SeptemberClasses({
  data,
  isLoading,
  error,
}: {
  data: RegularMyClassResponse | undefined;
  isLoading: boolean;
  error: unknown;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-1 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground px-6 text-center">
        There is no course intake open at the moment.
      </div>
    );
  }

  if (data.slots.length === 0) {
    return <NothingYet awaiting={data.slots_awaiting_a_tutor} />;
  }

  const placed = data.slots.reduce((n, s) => n + s.students.length, 0);
  const returning = data.slots.reduce(
    (n, s) => n + s.students.filter((st) => st.taught_by_me_last_year).length,
    0
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* A sentence rather than three figures in boxes: this is a page a tutor
          reads once a week to see how their September is filling up. */}
      <p className="text-xs text-muted-foreground mb-3">
        {placed === 0
          ? `You are down to teach ${countText(data.slots.length, "class", "classes")} in September. Nobody has been placed in ${data.slots.length === 1 ? "it" : "them"} yet.`
          : `${countText(placed, "student has", "students have")} been placed in your ${countText(data.slots.length, "class", "classes")} for September${returning > 0 ? `, ${returning} of whom you taught last year` : ""}.`}
        {data.slots_awaiting_a_tutor > 0 && (
          <>
            {" "}
            {countText(data.slots_awaiting_a_tutor, "class", "classes")} at your branch
            {data.slots_awaiting_a_tutor === 1 ? " has" : " have"} nobody down to teach
            {data.slots_awaiting_a_tutor === 1 ? " it" : " them"} yet, so this can still change.
          </>
        )}
      </p>

      <div className="flex-1 min-h-0 overflow-auto space-y-4">
        {data.slots.map((slot) => (
          <SlotCard key={slot.slot_id} slot={slot} />
        ))}
      </div>
    </div>
  );
}

/** What a tutor sees before the office has decided who teaches what, which is
 *  most of them for most of August. An empty page that does not explain itself
 *  reads as a page that is broken. */
function NothingYet({ awaiting }: { awaiting: number }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground gap-2 px-6">
      <CalendarDays className="h-6 w-6" />
      <p className="text-sm max-w-md">
        {awaiting > 0
          ? `You are not down to teach any of September's classes yet. ${countText(awaiting, "class", "classes")} at your branch ${awaiting === 1 ? "is" : "are"} still waiting for a tutor, so this page will fill in as the office arranges them.`
          : "You are not down to teach any of September's classes yet. This page fills in once the office arranges the timetable."}
      </p>
    </div>
  );
}

function SlotCard({ slot }: { slot: RegularMyClassSlot }) {
  const full = slot.students.length >= slot.max_students;
  return (
    <div className="rounded-lg border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 bg-white/40 dark:bg-white/[0.02]">
      <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-b border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40">
        <span className="text-sm font-medium text-foreground">
          {slot.slot_day} {slot.time_slot}
        </span>
        <span className="text-xs text-muted-foreground">{slot.location}</span>
        {slot.grade && (
          <span className="text-[11px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">
            {slot.grade}
            {slot.lang_stream ? ` ${streamWord(slot.lang_stream)}` : ""}
          </span>
        )}
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1 text-xs tabular-nums",
            full ? "text-amber-700 dark:text-amber-400 font-medium" : "text-muted-foreground"
          )}
          title={full ? "This class is full" : "Places taken out of the class size"}
        >
          <Users className="h-3.5 w-3.5" />
          {slot.students.length} of {slot.max_students}
        </span>
      </div>

      {slot.students.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-muted-foreground">
          Nobody has been placed in this class yet.
        </p>
      ) : (
        <ul className="divide-y divide-[#e8d4b8]/30 dark:divide-[#6b5a4a]/30">
          {slot.students.map((student) => (
            <li key={student.application_id} className="px-3 py-2">
              <ClassmateRow student={student} slotGrade={slot.grade} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClassmateRow({
  student,
  slotGrade,
}: {
  student: RegularMyClassStudent;
  // The class's own grade, when it has one. A row only says the student's
  // grade where it differs, which happens in the slots the office leaves open
  // to any grade. Repeating F2 down a column headed F2 is noise.
  slotGrade?: string | null;
}) {
  return (
    <div className="flex items-start gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
        {student.student_code && <StudentCodeBadge code={student.student_code} />}
        {student.student_id ? (
          <StudentLink
            row={{ student_id: student.student_id, student_name: student.student_name }}
            className="text-sm font-medium text-foreground"
          />
        ) : (
          <span className="text-sm font-medium text-foreground">{student.student_name}</span>
        )}
        {/* New to us, so there is no record to open and nothing to read up on
            before September. Worth saying rather than leaving as a name that
            happens not to be a link. */}
        {!student.student_id && (
          <span className="text-[11px] text-muted-foreground">new to the centre</span>
        )}
        {student.taught_by_me_last_year && (
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
            yours last year
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto shrink-0">
        {student.grade && student.grade !== slotGrade && <span>{student.grade}</span>}
        <span>{regularStatusLabel(student.application_status, "en")}</span>
      </div>
    </div>
  );
}

/** "1 student has" / "3 students have", so the sentences above read as
 *  sentences rather than as a count with a plural bolted on. */
function countText(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function streamWord(stream: string): string {
  return stream === "C" ? "Chinese" : stream === "E" ? "English" : stream;
}
