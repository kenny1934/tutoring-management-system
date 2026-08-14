"use client";

import { useMemo } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StudentCodeBadge } from "@/components/summer/prospect-badges";
import { StudentLink } from "@/components/admin/RegularRetentionSections";
import {
  DAY_ABBREV,
  WEEK_DAY_ORDER,
  foldStream,
  getGradeColor,
  regularStatusLabel,
} from "@/lib/regular-utils";
import type { RegularMyClassResponse, RegularMyClassSlot, RegularMyClassStudent } from "@/types";

/** Who is coming to a tutor's classes in September.
 *
 *  The forward-looking half of renewal. The chasing tab looks back at the
 *  students they taught last year and asks who has not come back; this looks
 *  at the slots they are down to teach and says who has been placed in them.
 *  The two populations differ on purpose. A class fills up with families the
 *  tutor has never met, and some of last year's students end up with somebody
 *  else.
 *
 *  Drawn as the week rather than as a list, the same way the office reads the
 *  arrangement board, because the first thing a tutor wants from September is
 *  the shape of it: which evenings are gone, which are free, and how full each
 *  class is. A class caps at eight students, so every name fits in the cell it
 *  belongs to and nothing has to be opened to be read. */
export function SeptemberClasses({
  data,
  isLoading,
  error,
}: {
  data: RegularMyClassResponse | undefined;
  isLoading: boolean;
  error: unknown;
}) {
  const week = useMemo(() => buildWeek(data?.slots ?? []), [data]);

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

  if (data.slots.length === 0) return <NothingYet />;

  const placed = data.slots.reduce((n, s) => n + s.students.length, 0);
  const returning = data.slots.reduce(
    (n, s) => n + s.students.filter((st) => st.taught_by_me_last_year).length,
    0
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* A sentence rather than three figures in boxes: this is a page a tutor
          reads once a week to see how their September is filling up. */}
      <p className="text-xs text-muted-foreground mb-3 shrink-0">
        {placed === 0
          ? `You are down to teach ${countText(data.slots.length, "class", "classes")} in September. Nobody has been placed in ${data.slots.length === 1 ? "it" : "them"} yet.`
          : `${countText(placed, "student has", "students have")} been placed in your ${countText(data.slots.length, "class", "classes")} for September${returning > 0 ? `, ${returning} of whom you taught last year` : ""}.`}
      </p>

      {/* A phone gets the same week as a diary. Four day columns need about
          720px between them and a phone has 390, so the grid there would be a
          sideways scroll through cells too narrow to hold a name. */}
      {/* No flex-1 on either view: a tutor with three classes gets a panel the
          size of three classes rather than one stretched down an empty screen,
          and a week too tall for the space shrinks and scrolls inside itself. */}
      <div className="md:hidden min-h-0 overflow-auto space-y-4">
        {week.days.map((day) => (
          <div key={day}>
            <h2 className="text-xs font-semibold text-foreground mb-1.5">{day}</h2>
            <div className="space-y-2">
              {week.byDay.get(day)?.map((slot) => (
                <ClassCard
                  key={slot.slot_id}
                  slot={slot}
                  showTime
                  showBranch={week.manyBranches}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* The week itself, from a tablet up. Only the days and the times this
          tutor actually teaches, so a week with three evenings in it is three
          columns rather than seven with four of them blank. */}
      <div className="hidden md:block min-h-0 overflow-auto rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-20">
            <tr className="bg-[#faf8f5] dark:bg-[#1a1a1a] border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
              <th className="sticky left-0 z-30 bg-[#faf8f5] dark:bg-[#1a1a1a] w-24 px-2 py-2 text-left text-[11px] font-medium text-muted-foreground">
                Time
              </th>
              {week.days.map((day) => (
                <th
                  key={day}
                  className="px-2 py-2 text-center text-xs font-medium text-foreground min-w-[9.5rem]"
                >
                  {DAY_ABBREV[day] ?? day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {week.times.map((time) => (
              <tr
                key={time}
                className="align-top border-t border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50"
              >
                <td className="sticky left-0 z-10 bg-[#faf8f5] dark:bg-[#1a1a1a] border-r border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 px-2 py-2 text-[11px] tabular-nums text-muted-foreground whitespace-nowrap">
                  {time}
                </td>
                {week.days.map((day) => {
                  const here = week.cells.get(cellKey(day, time));
                  return (
                    <td key={day} className="p-1.5 space-y-1.5">
                      {here?.map((slot) => (
                        <ClassCard
                          key={slot.slot_id}
                          slot={slot}
                          showBranch={week.manyBranches}
                        />
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Legend />
    </div>
  );
}

/** What the dots and the green word next to a name mean.
 *
 *  Said in sentences under the week rather than as a key of symbols, because
 *  the thing worth knowing is not what the dot is called: it is that half a
 *  class having hollow dots means those places are not settled yet. */
function Legend() {
  return (
    <p className="text-[11px] text-muted-foreground mt-2 shrink-0">
      A filled dot means the family has paid or enrolled, so the place is
      settled. A hollow one means they are still somewhere in the application,
      and you can hover a dot to see where. A name marked{" "}
      <span className="text-emerald-700 dark:text-emerald-400">yours</span> is a
      student you taught last year, and one marked new has never studied here,
      so there is no record of them to open yet.
    </p>
  );
}

/** What a tutor sees before the office has decided who teaches what, which is
 *  most of them for most of August. An empty page that does not explain itself
 *  reads as a page that is broken. */
function NothingYet() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground gap-2 px-6">
      <CalendarDays className="h-6 w-6" />
      <p className="text-sm max-w-md">
        You are not down to teach any of September&apos;s classes yet. This page fills in once the
        office has arranged the timetable.
      </p>
    </div>
  );
}

/** One class, drawn the same way in a cell of the week and in the phone's
 *  agenda. The container query is why: everything that only earns its place
 *  when there is room, which is the student codes, appears in the agenda and
 *  stays out of a cell 150px wide. */
function ClassCard({
  slot,
  showTime,
  showBranch,
}: {
  slot: RegularMyClassSlot;
  /** The agenda has no time column, so the card carries its own time there. */
  showTime?: boolean;
  /** Only where a tutor teaches at more than one branch, which is rare. */
  showBranch?: boolean;
}) {
  const full = slot.students.length >= slot.max_students;
  return (
    <div className="@container rounded-lg border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 bg-white/50 dark:bg-white/[0.02] px-2 py-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {showTime && (
          <span className="text-xs font-medium text-foreground tabular-nums">
            {slot.time_slot}
          </span>
        )}
        <ClassGrade grade={slot.grade} langStream={slot.lang_stream} />
        <span
          className={cn(
            "ml-auto text-[11px] tabular-nums",
            full ? "text-amber-700 dark:text-amber-400 font-medium" : "text-muted-foreground"
          )}
          title={full ? "This class is full" : "Places taken out of the class size"}
        >
          {slot.students.length} of {slot.max_students}
        </span>
      </div>

      {showBranch && (
        <div className="text-[11px] text-muted-foreground mt-0.5">{slot.location}</div>
      )}

      {slot.students.length === 0 ? (
        <p className="text-[11px] text-muted-foreground mt-1">
          Nobody has been placed in this class yet.
        </p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {slot.students.map((student) => (
            <li key={student.application_id}>
              <Classmate student={student} slotGrade={slot.grade} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The class's grade and stream, as the same badge a tutor sees against a
 *  lesson on their sessions page: "F2C", the palette colour behind it, dark
 *  grey text that does not follow the theme because the colour does not
 *  either.
 *
 *  Plenty of slots are still half described in August, so the two thinner
 *  cases say what is known instead of leaving the card headed by nothing. */
function ClassGrade({ grade, langStream }: { grade?: string | null; langStream?: string | null }) {
  const stream = foldStream(langStream);

  if (!grade) {
    return (
      <span
        className="text-[11px] text-muted-foreground"
        title="The office has not settled what this class is yet."
      >
        {stream ? `Stream ${stream}` : "Grade not set"}
      </span>
    );
  }

  return (
    <span
      className="text-[11px] px-1.5 py-0.5 rounded font-semibold text-gray-800"
      style={{ backgroundColor: getGradeColor(grade, stream ?? undefined) }}
    >
      {grade}
      {stream ?? ""}
    </span>
  );
}

/** Statuses that mean the place is settled and the student is coming. Everyone
 *  else is somewhere on the ladder between applying and paying, which is worth
 *  telling apart on a class list: half a class of hollow dots in the last week
 *  of August is a class that might not run. */
const SETTLED_STATUSES = new Set(["Paid", "Enrolled"]);

function StatusDot({ status }: { status: string }) {
  const label = regularStatusLabel(status, "en");
  const settled = SETTLED_STATUSES.has(status);
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={cn(
        "mt-[0.35rem] h-1.5 w-1.5 shrink-0 rounded-full",
        settled ? "bg-emerald-500" : "border border-muted-foreground/70"
      )}
    />
  );
}

function Classmate({
  student,
  slotGrade,
}: {
  student: RegularMyClassStudent;
  /** The class's own grade, when it has one. A name only says the student's
   *  grade where it differs, which is every student in the slots the office has
   *  not settled a grade for. Repeating F2 down a column headed F2 is noise. */
  slotGrade?: string | null;
}) {
  const grade = student.grade && student.grade !== slotGrade ? student.grade : null;
  return (
    <div className="flex items-start gap-1 text-[11px] leading-snug">
      <StatusDot status={student.application_status} />
      {/* Only where the card is wide enough to hold it, which is the agenda.
          It is what the office searches by, and a tutor reads the name. */}
      {student.student_code && (
        <span className="hidden @3xs:inline shrink-0">
          <StudentCodeBadge code={student.student_code} />
        </span>
      )}
      {student.student_id ? (
        <StudentLink
          row={{ student_id: student.student_id, student_name: student.student_name }}
          className="text-foreground font-medium min-w-0"
        />
      ) : (
        <span className="text-foreground font-medium min-w-0">{student.student_name}</span>
      )}
      {student.taught_by_me_last_year && (
        <span className="text-emerald-700 dark:text-emerald-400 shrink-0">yours</span>
      )}
      {/* New to us, so there is no record to open and nothing to read up on
          before September. Kept at every width, unlike the code above it: which
          faces a tutor already knows is the point of reading a class list, and
          a name that is simply not a link says nothing. */}
      {!student.student_id && (
        <span className="text-muted-foreground shrink-0">new</span>
      )}
      {grade && <span className="ml-auto text-muted-foreground shrink-0">{grade}</span>}
    </div>
  );
}

/** The week a tutor's slots add up to.
 *
 *  Both the columns and the rows come from their own classes rather than from
 *  the branch's whole ladder, so somebody teaching three evenings gets three
 *  columns instead of seven with four of them empty. The database hands the
 *  slots back in alphabetical order of the day name, which puts Friday first
 *  and Wednesday last, so the ordering is done here where the week is drawn. */
function buildWeek(slots: RegularMyClassSlot[]) {
  const days: string[] = WEEK_DAY_ORDER.filter((d) => slots.some((s) => s.slot_day === d));
  // A day the office spelled some other way would otherwise vanish from a
  // tutor's timetable without anybody noticing.
  for (const s of slots) {
    if (!days.includes(s.slot_day)) days.push(s.slot_day);
  }

  const times = [...new Set(slots.map((s) => s.time_slot))].sort(
    (a, b) => startMinutes(a) - startMinutes(b) || a.localeCompare(b)
  );

  const cells = new Map<string, RegularMyClassSlot[]>();
  const byDay = new Map<string, RegularMyClassSlot[]>();
  for (const s of slots) {
    push(cells, cellKey(s.slot_day, s.time_slot), s);
    push(byDay, s.slot_day, s);
  }
  // The agenda has no time column to read down, so each day's classes run in
  // the order they happen.
  for (const list of byDay.values()) {
    list.sort((a, b) => startMinutes(a.time_slot) - startMinutes(b.time_slot));
  }

  return {
    days,
    times,
    cells,
    byDay,
    manyBranches: new Set(slots.map((s) => s.location)).size > 1,
  };
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

const cellKey = (day: string, time: string) => `${day}|${time}`;

/** Where a slot sits in the day, from a label like "16:45 - 18:15". Anything
 *  that does not parse sorts to the end rather than to eight in the morning. */
function startMinutes(timeSlot: string): number {
  const match = /(\d{1,2}):(\d{2})/.exec(timeSlot);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** "1 student has" / "3 students have", so the sentences above read as
 *  sentences rather than as a count with a plural bolted on. */
function countText(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
