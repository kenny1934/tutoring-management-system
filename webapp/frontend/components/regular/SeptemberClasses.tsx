"use client";

import { Fragment, useMemo, useState } from "react";
import { CalendarDays, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EnteringGradeBadge } from "@/components/ui/grade-label";
import { StudentLink } from "@/components/admin/RegularRetentionSections";
import { parseTimeSlot, timeToMinutes } from "@/lib/calendar-utils";
import { plural } from "@/lib/formatters";
import {
  DAY_ABBREV,
  REGULAR_STATUS_COLORS,
  WEEK_DAY_ORDER,
  foldStream,
  regularStatusLabel,
  sortWeekDays,
} from "@/lib/regular-utils";
import type { RegularMyClassResponse, RegularMyClassSlot, RegularMyClassStudent } from "@/types";

/** The week borrows its look from the sessions page and its structure from the
 *  arrangement board, on purpose.
 *
 *  A tutor already reads one weekly grid in this app every day, so this one
 *  takes that grid's skeleton rather than inventing a second convention: the
 *  time column on the left at 60px, all seven days across the top in short
 *  capitals, the days with nothing on them collapsed to a strip you can click
 *  open, and one small card per student with the stage colour down its right
 *  edge. The rows come from the arrangement board instead, which draws the same
 *  slots: one row per class time rather than one per clock hour, because these
 *  are weekly slots at a handful of fixed times and a row that grows to fit its
 *  roster is what keeps the names inside the cell. */
const TIME_COLUMN = 60;
const DAY_COLUMN_MIN = 100;
const COLLAPSED_DAY = 36;

/** Who is coming to a tutor's classes in September.
 *
 *  The forward-looking half of renewal. The chasing tab looks back at the
 *  students they taught last year and asks who has not come back; this looks
 *  at the slots they are down to teach and says who has been placed in them.
 *  The two populations differ on purpose. A class fills up with families the
 *  tutor has never met, and some of last year's students end up with somebody
 *  else.
 *
 *  A class caps at eight students, so every name fits in the cell it belongs
 *  to and nothing has to be opened before the week can be read. */
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

  // Which empty days have been opened, and whether all of them are. Same two
  // controls the sessions grid gives, so a week with three teaching days does
  // not hide the fact that there are seven.
  const [openedDays, setOpenedDays] = useState<Set<string>>(new Set());
  const [showEveryDay, setShowEveryDay] = useState(false);

  // byDay holds one entry per day this tutor teaches, so it answers both "is
  // there anything here" and "in what order", and there is no second set to
  // keep in step with it.
  const collapsed = (day: string) =>
    !showEveryDay && !week.byDay.has(day) && !openedDays.has(day);

  const toggleDay = (day: string) =>
    setOpenedDays((current) => {
      const next = new Set(current);
      if (!next.delete(day)) next.add(day);
      return next;
    });

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
  const emptyDays = week.columns.length - week.byDay.size;

  // Both the column template and the width the grid refuses to shrink below come
  // out of one pass over the columns, since they are the same decision measured
  // twice.
  let minGridWidth = TIME_COLUMN;
  const columnWidths = week.columns.map((day) => {
    const width = collapsed(day) ? COLLAPSED_DAY : DAY_COLUMN_MIN;
    minGridWidth += width;
    return collapsed(day) ? `${width}px` : `minmax(${width}px, 1fr)`;
  });
  const gridColumns = `${TIME_COLUMN}px ${columnWidths.join(" ")}`;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* A sentence rather than three figures in boxes: this is a page a tutor
          reads once a week to see how their September is filling up. The empty
          days sit behind the same control the sessions grid uses for them. */}
      <div className="flex items-start justify-between gap-3 mb-3 shrink-0">
        <p className="text-xs text-muted-foreground">
          {placed === 0
            ? `You are down to teach ${plural(data.slots.length, "class", "classes")} in September. Nobody has been placed in ${data.slots.length === 1 ? "it" : "them"} yet.`
            : `${plural(placed, "student has", "students have")} been placed in your ${plural(data.slots.length, "class", "classes")} for September${returning > 0 ? `, ${returning} of whom you taught last year` : ""}.`}
        </p>
        {emptyDays > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowEveryDay(!showEveryDay)}
            className="hidden md:flex items-center gap-1 h-7 px-2 text-xs text-gray-600 dark:text-gray-400 shrink-0"
            title={showEveryDay ? "Hide the days you do not teach" : "Show every day of the week"}
          >
            {showEveryDay ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showEveryDay ? "Hide empty" : `+${emptyDays} empty`}
          </Button>
        )}
      </div>

      {/* A phone gets the same week as a diary. Seven columns need about 760px
          and a phone has 390, so the grid there is a sideways scroll through
          cells too narrow to hold a name. The cards inside are the same. */}
      <div className="md:hidden min-h-0 overflow-auto space-y-4">
        {[...week.byDay].map(([day, slots]) => (
          <div key={day}>
            <h2 className="text-xs font-bold uppercase text-gray-700 dark:text-gray-300 mb-1.5">
              {day}
            </h2>
            <div className="space-y-2">
              {slots.map((slot) => (
                <ClassBlock
                  key={slot.slot_id}
                  slot={slot}
                  showTime
                  showBranch={week.manyBranches}
                  className="bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg px-2 py-1.5"
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* The week itself, from a tablet up. */}
      <div className="hidden md:flex min-h-0 flex-col bg-white dark:bg-[#1a1a1a] border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
        <div className="overflow-auto min-h-0">
          <div className="grid" style={{ gridTemplateColumns: gridColumns, minWidth: minGridWidth }}>
            {/* Header: the time corner, then every day of the week */}
            <div className="sticky top-0 left-0 z-30 p-1.5 flex items-center bg-[#fef9f3] dark:bg-[#2d2618] border-b-2 border-r border-[#e8d4b8] dark:border-[#6b5a4a]">
              <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400">TIME</p>
            </div>
            {week.columns.map((day, i) => {
              const shut = collapsed(day);
              const teaching = week.byDay.has(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={teaching ? undefined : () => toggleDay(day)}
                  aria-expanded={teaching ? undefined : !shut}
                  aria-label={
                    teaching ? undefined : `${shut ? "Show" : "Hide"} ${day}, a day you do not teach`
                  }
                  className={cn(
                    "sticky top-0 z-20 py-1 bg-[#fef9f3] dark:bg-[#2d2618]",
                    "border-b-2 border-[#e8d4b8] dark:border-[#6b5a4a]",
                    i < week.columns.length - 1 && "border-r",
                    shut ? "px-0.5" : "px-1.5",
                    !teaching &&
                      "cursor-pointer hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#a0704b]"
                  )}
                >
                  {shut ? (
                    <span
                      className="text-[9px] font-bold whitespace-nowrap text-gray-400 dark:text-gray-500"
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                    >
                      {DAY_ABBREV[day] ?? day}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "text-xs font-bold uppercase",
                        teaching
                          ? "text-gray-700 dark:text-gray-300"
                          : "text-gray-400 dark:text-gray-500"
                      )}
                    >
                      {DAY_ABBREV[day] ?? day}
                    </span>
                  )}
                </button>
              );
            })}

            {/* One row per class time, rather than per hour: these are weekly
                slots at a handful of fixed times, and a row that sizes itself
                to its roster is what lets the names stay in the cell. */}
            {week.times.map((time) => {
              const { start, end } = splitSlotTime(time);
              return (
                <Fragment key={time}>
                  <div className="sticky left-0 z-10 px-2 py-1.5 bg-[#fef9f3] dark:bg-[#2d2618] border-t border-r border-[#e8d4b8] dark:border-[#6b5a4a]">
                    <div className="text-xs font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                      {start}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">
                      {end}
                    </div>
                  </div>
                  {week.columns.map((day, i) => {
                    const here = week.cells.get(cellKey(day, time));
                    const shut = collapsed(day);
                    return (
                      <div
                        key={day}
                        onClick={shut ? () => toggleDay(day) : undefined}
                        className={cn(
                          "border-t border-[#e8d4b8] dark:border-[#6b5a4a] p-1 space-y-1.5",
                          i < week.columns.length - 1 && "border-r",
                          shut && "bg-gray-50 dark:bg-gray-900/30 cursor-pointer"
                        )}
                      >
                        {!shut &&
                          here?.map((slot) => (
                            <ClassBlock
                              key={slot.slot_id}
                              slot={slot}
                              showBranch={week.manyBranches}
                            />
                          ))}
                      </div>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>

      <Legend />
    </div>
  );
}

/** What the colours and the two words next to a name mean.
 *
 *  Said in sentences under the week rather than as a key of symbols, because
 *  the thing worth knowing is not what the colours are called: it is that a
 *  class of amber cards in the last week of August is a class that might not
 *  run. */
function Legend() {
  return (
    <p className="text-[11px] text-muted-foreground mt-2 shrink-0">
      Every card takes the colour the office&apos;s own board gives that stage, so a
      green one is a family that has paid or enrolled and their place is settled,
      and anything else is a family still working through it. Hover a card to
      read the stage. A card marked{" "}
      <span className="text-emerald-700 dark:text-emerald-400">yours</span> is a
      student you taught last year, and one reading new to us has never studied
      here, so there is no record of them to open yet.
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

/** One class: a line saying what it is and how full it is, then its students.
 *
 *  The heading is sized like the meta line on a session card, because that is
 *  what it is. Heading and roster are one component because nothing ever wants
 *  one without the other, and both the grid cell and the phone's agenda place
 *  the pair as a unit. */
function ClassBlock({
  slot,
  showTime,
  showBranch,
  className,
}: {
  slot: RegularMyClassSlot;
  /** The agenda has no time column, so the heading carries the time there. */
  showTime?: boolean;
  /** Only where a tutor teaches at more than one branch, which is rare. */
  showBranch?: boolean;
  /** The agenda draws each class as its own card; in the grid the cell is the
   *  card and the block just fills it. */
  className?: string;
}) {
  const full = slot.students.length >= slot.max_students;
  const stream = foldStream(slot.lang_stream);
  return (
    <div className={className}>
    <div className="flex items-center gap-1 px-0.5 pb-1 flex-wrap">
      {showTime && (
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 tabular-nums">
          {slot.time_slot}
        </span>
      )}
      {slot.grade ? (
        // A slot's grade is the grade its class is for, so it is already the
        // grade these students are entering and is never promoted for display.
        <EnteringGradeBadge
          className="text-[9px] px-1 py-px rounded font-semibold text-gray-800 whitespace-nowrap"
          grade={slot.grade}
          langStream={stream}
        />
      ) : (
        // Plenty of slots are still half described in August, so this says what
        // is known instead of leaving the class headed by nothing.
        <span
          className="text-[9px] text-gray-500 dark:text-gray-400"
          title="The office has not settled what this class is yet."
        >
          {stream ? `Stream ${stream}` : "Grade not set"}
        </span>
      )}
      {showBranch && (
        <span className="text-[9px] text-gray-500 dark:text-gray-400">{slot.location}</span>
      )}
      <span
        className={cn(
          "ml-auto text-[9px] font-bold tabular-nums",
          full ? "text-amber-700 dark:text-amber-400" : "text-gray-500 dark:text-gray-400"
        )}
        title={full ? "This class is full" : "Places taken out of the class size"}
      >
        {slot.students.length} of {slot.max_students}
      </span>
      </div>

      {slot.students.length === 0 ? (
        <p className="text-[10px] text-gray-500 dark:text-gray-400 px-0.5">Nobody placed yet.</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {slot.students.map((student) => (
            <StudentCard key={student.application_id} student={student} slotGrade={slot.grade} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One student, built like a session card on the weekly grid: the code and any
 *  markers on a small top line, the name under it, and the stage in colour down
 *  the right-hand edge. A tutor who reads their sessions every day has read
 *  this card thousands of times already. */
function StudentCard({
  student,
  slotGrade,
}: {
  student: RegularMyClassStudent;
  /** The class's own grade, when it has one. A card only carries the student's
   *  grade where it differs, which is every student in the slots the office has
   *  not settled a grade for. Repeating F2 down a column headed F2 is noise. */
  slotGrade?: string | null;
}) {
  const stage = REGULAR_STATUS_COLORS[student.application_status] ?? REGULAR_STATUS_COLORS.Submitted;
  const label = regularStatusLabel(student.application_status, "en");
  const grade = student.grade && student.grade !== slotGrade ? student.grade : null;

  return (
    <div
      title={label}
      className={cn("rounded overflow-hidden shadow-sm flex min-h-[22px]", stage.bg)}
    >
      <div className="flex-1 flex flex-col min-w-0 px-1.5 py-0.5">
        <p className="font-bold text-[9px] text-gray-500 dark:text-gray-400 leading-tight flex items-center justify-between gap-1">
          {/* New to us, so there is no record to open and nothing to read up on
              before September, which is worth saying where the code would be
              rather than leaving a name that happens not to be a link. */}
          <span className="truncate">{student.student_code ?? "new to us"}</span>
          {student.taught_by_me_last_year && (
            <span className="text-emerald-700 dark:text-emerald-400 shrink-0">yours</span>
          )}
        </p>
        <p className="font-semibold text-[10px] leading-tight flex items-center gap-0.5 overflow-hidden">
          {student.student_id ? (
            <StudentLink
              row={{ student_id: student.student_id, student_name: student.student_name }}
              className="truncate text-gray-900 dark:text-gray-100"
            />
          ) : (
            <span className="truncate text-gray-900 dark:text-gray-100">
              {student.student_name}
            </span>
          )}
          {grade && (
            // The application's own grade, which is the one they are entering:
            // an F4 application is a student going into F4. The payload already
            // carries the stream that governs their placement.
            <EnteringGradeBadge
              className="text-[7px] px-1 py-px rounded text-gray-800 whitespace-nowrap shrink-0"
              grade={grade}
              langStream={student.lang_stream}
            />
          )}
        </p>
      </div>
      <div className={cn("w-3 shrink-0", stage.dot)} />
    </div>
  );
}

/** The week a tutor's slots add up to.
 *
 *  The rows come from their own classes rather than from the branch's whole
 *  ladder, so a tutor who teaches two evenings gets two rows instead of ten
 *  hours of empty calendar. The columns are the whole week either way, because
 *  that is how the sessions grid draws it and a week with days missing reads as
 *  a week with data missing. The database hands the slots back in alphabetical
 *  order of the day name, which puts Friday first and Wednesday last, so the
 *  ordering is done here where the week is drawn.
 *
 *  `byDay` is the ordered list of days this tutor actually teaches, so it also
 *  answers whether a column has anything in it, and `columns` is every column
 *  the grid draws. */
function buildWeek(slots: RegularMyClassSlot[]) {
  const teaching = sortWeekDays([...new Set(slots.map((s) => s.slot_day))]);
  // A day the office spelled some other way sorts last out of sortWeekDays and
  // gets a column of its own, rather than vanishing from a tutor's timetable
  // without anybody noticing.
  const columns = [
    ...WEEK_DAY_ORDER,
    ...teaching.filter((d) => !(WEEK_DAY_ORDER as readonly string[]).includes(d)),
  ];

  const times = [...new Set(slots.map((s) => s.time_slot))].sort(
    (a, b) => startMinutes(a) - startMinutes(b) || a.localeCompare(b)
  );

  const cells = new Map<string, RegularMyClassSlot[]>();
  // Seeded in week order, so iterating it gives the phone's agenda its days in
  // the order they happen without a second list to keep in step.
  const byDay = new Map<string, RegularMyClassSlot[]>(teaching.map((d) => [d, []]));
  for (const s of slots) {
    push(cells, cellKey(s.slot_day, s.time_slot), s);
    byDay.get(s.slot_day)!.push(s);
  }
  // The agenda has no time column to read down, so each day's classes run in
  // the order they happen.
  for (const list of byDay.values()) {
    list.sort((a, b) => startMinutes(a.time_slot) - startMinutes(b.time_slot));
  }

  return {
    columns,
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

/** A slot label reads "16:45 - 18:15", which the time column stacks the way an
 *  hour label sits in the sessions grid's 60px gutter. Anything the shared
 *  parser cannot read keeps its label whole rather than losing half of it, and
 *  sorts to the end of the day rather than to eight in the morning. */
function splitSlotTime(timeSlot: string): { start: string; end: string } {
  return parseTimeSlot(timeSlot) ?? { start: timeSlot, end: "" };
}

function startMinutes(timeSlot: string): number {
  const parsed = parseTimeSlot(timeSlot);
  return parsed ? timeToMinutes(parsed.start) : Number.MAX_SAFE_INTEGER;
}
