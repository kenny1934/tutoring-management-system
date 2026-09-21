import { getAnswerPageNumbers, getExercisePageNumbers } from "@/lib/lesson-utils";
import type { HomeworkCompletion, Session, SessionExercise } from "@/types";

/**
 * One homework item in the Check Viewer. The viewer can step through items
 * from several lessons at once, as it does across a whole slot in bulk rate,
 * so each item carries the lesson its mark should land on.
 */
export interface CheckItem {
  homework: HomeworkCompletion;
  /** The lesson a mark made in the viewer is saved against. */
  sessionId: number;
  /** Whose homework it is. Set this when the list covers more than one student. */
  studentName?: string;
}

/** Wraps a list of homework as Check Viewer items that all mark against the same lesson. */
export function checkItems(
  homework: HomeworkCompletion[],
  sessionId: number,
  studentName?: string,
): CheckItem[] {
  return homework.map((hw) => ({ homework: hw, sessionId, studentName }));
}

/**
 * A whole slot's homework as one list, student by student in the order the
 * lessons are given, so the Check Viewer's next button carries on to the next
 * student's homework.
 */
export function slotCheckItems(
  sessions: Pick<Session, "id" | "student_name">[],
  homeworkBySession: ReadonlyMap<number, HomeworkCompletion[]> | undefined,
): CheckItem[] {
  return sessions.flatMap((s) => checkItems(homeworkBySession?.get(s.id) ?? [], s.id, s.student_name));
}

/** Whether there's a worksheet to open. A homework item that's only a web link has nothing to show. */
export function canOpenInCheckViewer(hw: Pick<HomeworkCompletion, "pdf_name">): boolean {
  return !!hw.pdf_name?.trim();
}

/**
 * The homework, in the shape the lesson views' file loaders read. The id is
 * the assignment's own, which is also what the viewer keys its page renders on.
 */
export function homeworkAsExercise(hw: HomeworkCompletion): SessionExercise {
  return {
    id: hw.session_exercise_id,
    session_id: hw.assigned_session_id ?? hw.current_session_id,
    exercise_type: "HW",
    created_by: "",
    pdf_name: hw.pdf_name,
    page_start: hw.page_start,
    page_end: hw.page_end,
    remarks: hw.assignment_remarks,
    url: hw.url,
    url_title: hw.url_title,
    answer_pdf_name: hw.answer_pdf_name,
    answer_page_start: hw.answer_page_start,
    answer_page_end: hw.answer_page_end,
    answer_remarks: hw.answer_remarks,
  };
}

/**
 * Which pages of the answer key to show, given how many pages the file has.
 * An empty list means every page.
 *
 * When someone chose the answer key and gave it pages, those pages are used.
 * Otherwise the worksheet's pages are, because answer keys follow their
 * worksheets page for page: in September 2026, 69 of the 71 homework items
 * with both ranges set had the same pages on each. Lesson mode shows the whole
 * answer file in that case, but a tutor marking homework wants the pages that
 * were set, not the whole book.
 *
 * Any page the file doesn't have is dropped. If that leaves nothing, the
 * answer key isn't laid out like its worksheet after all, so every page is
 * shown and the tutor can find the answers themselves.
 */
export function answerPageNumbers(hw: HomeworkCompletion, pageCount: number | null): number[] {
  const exercise = homeworkAsExercise(hw);
  const chosen = hw.answer_pdf_name ? getAnswerPageNumbers(exercise) : [];
  const wanted = chosen.length > 0 ? chosen : getExercisePageNumbers(exercise);
  if (pageCount === null) return wanted;
  return wanted.filter((page) => page >= 1 && page <= pageCount);
}
