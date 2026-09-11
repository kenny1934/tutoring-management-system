"use client";

import { useState, type MouseEvent, type SyntheticEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronRight, Info, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCoursewareUsageDetail, useSession } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
import { stripExtension } from "@/lib/curriculum-labels";
import { formatDayFirstDate } from "@/lib/formatters";
import type { CoursewareUsageDetail, CurriculumFile } from "@/types";

// Loaded only when a lesson is opened. The popover imports the exercise
// modal, which imports the School Progress panel this list sits in, so a
// static import here would close that loop. It would also pull both into the
// curriculum page, which shows this list through its search.
const SessionDetailPopover = dynamic(
  () => import("@/components/sessions/SessionDetailPopover").then((mod) => ({ default: mod.SessionDetailPopover })),
  { ssr: false }
);

/** Anchors the lesson popover under the icon that opened it. The icon's own
 *  position is used rather than the pointer's, so the popover lands in the
 *  same place when the icon is pressed from the keyboard. */
type OpenLesson = (sessionId: number, e: MouseEvent<HTMLButtonElement>) => void;

// The list opens at ten lines and grows twenty at a time. The endpoint stops
// at a hundred, which only the most popular worksheets ever reach.
const FIRST_PAGE = 10;
const PAGE_STEP = 20;
const MAX_LINES = 100;

/** "Rescheduled - Make-up Booked" as the short word the tag shows, or null
 *  when the lesson went ahead. A few exercises sit on lessons that were
 *  moved or called off after the work had been set. Their lines stay in the
 *  list, so it still adds up to the count on the file, but they carry this
 *  tag so the tutor can see the student may not have done the work there. */
export function missedLessonTag(
  status: string | null | undefined
): { label: string; explanation: string } | null {
  const s = status || "";
  const makeUp = s.match(/^(.*) - (Make-up Booked|Pending Make-up)$/);
  if (makeUp) {
    const [, reason, state] = makeUp;
    const what =
      reason === "Sick Leave"
        ? { label: "Sick leave", happened: "was missed through sick leave" }
        : reason === "Weather Cancelled"
          ? { label: "Weather", happened: "was cancelled for bad weather" }
          : { label: "Rescheduled", happened: "was rescheduled" };
    const makeUpState =
      state === "Make-up Booked" ? "is booked" : "has not been booked yet";
    return {
      label: what.label,
      explanation: `The lesson ${what.happened} after this work was set, and the make-up ${makeUpState}.`,
    };
  }
  if (s === "Cancelled") {
    return {
      label: "Cancelled",
      explanation: "The lesson was cancelled after this work was set.",
    };
  }
  if (s === "No Show") {
    return { label: "No show", explanation: "The student did not come to this lesson." };
  }
  return null;
}

function pagesText(d: CoursewareUsageDetail): string | null {
  if (d.page_start == null) return null;
  return d.page_end != null && d.page_end !== d.page_start
    ? `p${d.page_start}-${d.page_end}`
    : `p${d.page_start}`;
}

function UsageLine({
  detail,
  showSchool,
  isThisStudent,
  canOpen,
  onOpenLesson,
}: {
  detail: CoursewareUsageDetail;
  showSchool: boolean;
  isThisStudent: boolean;
  canOpen: boolean;
  onOpenLesson: OpenLesson;
}) {
  const tag = missedLessonTag(detail.session_status);
  const pages = pagesText(detail);
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-[10px] text-gray-600 dark:text-gray-400 rounded px-1 -mx-1",
        isThisStudent && "bg-amber-50 dark:bg-amber-900/20",
        tag && "opacity-70"
      )}
      title={isThisStudent ? "This is the student you are setting work for." : undefined}
    >
      <span className="w-[4.5rem] shrink-0 tabular-nums text-gray-400 dark:text-gray-500">
        {formatDayFirstDate(detail.session_date)}
      </span>
      {/* The name and its school badge share the stretchy middle of the line,
          so the badge sits right after the name the way the sessions page
          shows it, and a long name is what gets cut short. */}
      <span className="flex items-center gap-1 flex-1 min-w-0">
        {/* Students at another branch are named but not linked, the same as
            the Trending list, because their records live under that branch. */}
        {canOpen ? (
          <Link
            href={`/students/${detail.student_id}`}
            target="_blank"
            className={cn(
              "truncate min-w-0 text-[#a0704b] dark:text-[#cd853f] hover:underline",
              isThisStudent && "font-medium"
            )}
          >
            {detail.student_name}
          </Link>
        ) : (
          <span className="truncate min-w-0">{detail.student_name}</span>
        )}
        {showSchool && detail.school && (
          <span className="shrink-0 text-[9px] px-1 py-px rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 whitespace-nowrap">
            {detail.school}
          </span>
        )}
      </span>
      <span
        className="truncate max-w-[7rem] text-gray-400 dark:text-gray-500"
        title={`Set by ${detail.tutor_name}`}
      >
        {detail.tutor_name}
      </span>
      <span
        className={cn(
          "shrink-0 px-1 rounded text-[9px]",
          detail.exercise_type === "CW"
            ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
            : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
        )}
      >
        {detail.exercise_type}
      </span>
      {pages && <span className="shrink-0 tabular-nums">{pages}</span>}
      {tag && (
        <span
          className="shrink-0 px-1 rounded text-[9px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
          title={tag.explanation}
        >
          {tag.label}
        </span>
      )}
      {canOpen ? (
        <button
          type="button"
          onClick={(e) => onOpenLesson(detail.session_id, e)}
          className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 shrink-0 cursor-pointer"
          title="Show this lesson's details"
          aria-label={`Show the lesson on ${formatDayFirstDate(detail.session_date)} with ${detail.student_name}`}
        >
          <Info className="h-2.5 w-2.5 text-gray-400 hover:text-[#a0704b]" />
        </button>
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
    </div>
  );
}

/** One run of lines from the endpoint, with its own "Show more". */
function UsageGroup({
  filename,
  school,
  excludeSchool,
  heading,
  showSchool,
  studentId,
  onOpenLesson,
}: {
  filename: string;
  school?: string;
  excludeSchool?: string;
  heading?: string;
  showSchool: boolean;
  studentId?: number | null;
  onOpenLesson: OpenLesson;
}) {
  const [limit, setLimit] = useState(FIRST_PAGE);
  const { selectedLocation } = useLocation();
  const { data, error, isLoading, isValidating } = useCoursewareUsageDetail(
    filename,
    "all-time",
    limit,
    undefined,
    undefined,
    school,
    excludeSchool
  );

  if (isLoading && !data) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading the lessons that used this file…
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-[10px] text-red-500">
        The lessons that used this file could not be loaded.
      </p>
    );
  }

  const lines = data ?? [];
  // A full page means there may be more behind it.
  const mightHaveMore = lines.length >= limit;
  return (
    <div className="space-y-0.5">
      {heading && (
        <p className="text-[10px] font-medium text-gray-600 dark:text-gray-400">{heading}</p>
      )}
      {lines.length === 0 ? (
        <p className="text-[10px] text-gray-500">No lessons were found for this file.</p>
      ) : (
        lines.map((d) => (
          <UsageLine
            key={d.exercise_id}
            detail={d}
            showSchool={showSchool}
            isThisStudent={studentId != null && d.student_id === studentId}
            canOpen={selectedLocation === "All Locations" || selectedLocation === d.location}
            onOpenLesson={onOpenLesson}
          />
        ))
      )}
      {mightHaveMore &&
        (limit < MAX_LINES ? (
          <button
            type="button"
            onClick={() => setLimit((n) => Math.min(n + PAGE_STEP, MAX_LINES))}
            disabled={isValidating}
            className="flex items-center gap-1 text-[10px] text-teal-700 dark:text-teal-400 hover:underline disabled:opacity-60"
          >
            {isValidating && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
            Show more
          </button>
        ) : (
          <p className="text-[10px] text-gray-400">
            Only the latest {MAX_LINES} lessons are shown.
          </p>
        ))}
    </div>
  );
}

const stopHere = (e: SyntheticEvent) => e.stopPropagation();

/** Who has been given this file, in which lesson and when. It opens under
 *  a file row from the usage count. When the list is scoped to a school, that
 *  school's students come first and the rest wait behind a button, because
 *  the school's own history is what tells a tutor how far along it is. */
export function CurriculumFileUsage({
  file,
  scopeSchool,
  studentId,
}: {
  file: CurriculumFile;
  scopeSchool?: string | null;
  /** The student the work is being set for, whose lines are highlighted. */
  studentId?: number | null;
}) {
  // The same key the count on the badge is grouped by: the file's name
  // without its extension. The lookup is case-insensitive.
  const filename = stripExtension(file.file_basename);
  const schoolCount = file.school_assignment_count || 0;
  const otherCount = Math.max(0, file.assignment_count - schoolCount);
  const [othersOpen, setOthersOpen] = useState(false);

  // The lesson whose detail popover is open, and where to anchor it. One
  // popover serves every line in the list.
  const [lesson, setLesson] = useState<{ id: number; x: number; y: number } | null>(null);
  const { data: lessonSession } = useSession(lesson?.id);
  const openLesson: OpenLesson = (sessionId, e) => {
    const icon = e.currentTarget.getBoundingClientRect();
    setLesson({ id: sessionId, x: icon.left, y: icon.bottom });
  };

  const body =
    scopeSchool && schoolCount > 0 ? (
      <>
        <UsageGroup
          filename={filename}
          school={scopeSchool}
          heading={`At ${scopeSchool}`}
          showSchool={false}
          studentId={studentId}
          onOpenLesson={openLesson}
        />
        {otherCount > 0 &&
          (othersOpen ? (
            <UsageGroup
              filename={filename}
              excludeSchool={scopeSchool}
              heading="At other schools"
              showSchool
              studentId={studentId}
              onOpenLesson={openLesson}
            />
          ) : (
            <button
              type="button"
              onClick={() => setOthersOpen(true)}
              className="flex items-center gap-0.5 text-[10px] text-teal-700 dark:text-teal-400 hover:underline"
            >
              <ChevronRight className="h-3 w-3" />
              {otherCount} more at other schools
            </button>
          ))}
      </>
    ) : (
      <UsageGroup
        filename={filename}
        heading={
          scopeSchool
            ? `No ${scopeSchool} students have had this file yet, so these are from other schools.`
            : undefined
        }
        showSchool
        studentId={studentId}
        onOpenLesson={openLesson}
      />
    );

  return (
    <div className="ml-5 mt-0.5 mb-1.5 pl-2 border-l-2 border-teal-100 dark:border-teal-900/50 space-y-1.5">
      {body}
      {lesson && (
        // The popover is portalled out of this list, but React still bubbles
        // its clicks and keys up through the component tree, so they stop
        // here rather than reaching the file row and the panels around it.
        <div className="contents" onClick={stopHere} onMouseDown={stopHere} onKeyDown={stopHere}>
          <SessionDetailPopover
            session={lessonSession ?? null}
            isOpen
            onClose={() => setLesson(null)}
            clickPosition={{ x: lesson.x, y: lesson.y }}
          />
        </div>
      )}
    </div>
  );
}
