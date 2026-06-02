import type { HomeworkCompletion } from "../types";

// Seed completions for HW that was assigned earlier and checked off in
// later sessions. Used so the student History tab can surface
// "submitted in X" info from the start.
export const seedHomeworkCompletions: HomeworkCompletion[] = [
  // Chan Ho Yin: HW rec-h2 and rec-h3 assigned in the 2026-05-12 session,
  // checked in today's (2026-05-19) session.
  {
    id: "hc-001",
    current_session_id: "sess-001-s-001",
    session_exercise_id: "rec-h2",
    student_id: "s-001",
    submitted: true,
    completion_status: "Complete",
    tutor_comments: "Solid work; all problems attempted.",
    checked_by: "t-wong",
    checked_at: "2026-05-19T08:00:00.000Z",
  },
  {
    id: "hc-002",
    current_session_id: "sess-001-s-001",
    session_exercise_id: "rec-h3",
    student_id: "s-001",
    submitted: true,
    completion_status: "Partial",
    tutor_comments: "Skipped Q4 and Q5. Review next week.",
    checked_by: "t-wong",
    checked_at: "2026-05-19T08:00:00.000Z",
  },
];
