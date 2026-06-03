// Shared types across prototypes. Mock-only.
//
// CSM-aligned types (Session, Enrollment, SessionExercise, HomeworkCompletion,
// SessionStatus) mirror the real backend schema in shape and field name:
// snake_case, statuses string-enum'd from the same set CSM uses. Prototype-only
// concepts (Checktable, Assessment, ParentContact, ChecktableAssignment) keep
// the lighter camelCase since they don't have a CSM counterpart yet.

export type HWLoad = "NO" | "Little" | "Normal" | "Many";

export type Student = {
  id: string;
  name: string;
  code: string;
  grade: string;
  school: string;
  hwLoad: HWLoad;
};

export type ChecktableItem = {
  id: string; // unique within table: `${seriesId}/${code}`
  code: string; // "640A", "C_Rev_6F_A01"
  note?: string; // "R", "P", "#" etc.
  pdfPath?: string; // resolved network path placeholder
  /** S3 key under the MC Drive bucket (e.g.
   *  "MC_Drive/Answer/01_SG_Letter Size/SG Level 1/SG101A1_..._ANS.pdf").
   *  When set, the AssignDialog preview renders the real PDF via the MC Drive
   *  viewer (see lib/mc-drive.ts). The viewer URL is derived at runtime to keep
   *  the generated checktable data small. */
  mcDriveS3Path?: string;
};

export type ChecktableCell = {
  items: ChecktableItem[];
  /** Learning objective for this set (the cell's items share one objective,
   *  e.g. SG101A1 + SG101A2). Populated from the courseware-objectives overlay
   *  at load time; absent until an objective is authored for the set. */
  objective?: string;
};

export type ChecktableChapter = {
  id: string;
  number: number;
  title: string;
  cells: Record<string, ChecktableCell>; // keyed by series id
};

export type ChecktableSection = {
  id: string;
  label: string; // "上學期", "下學期", "補充教材"
  chapters: ChecktableChapter[];
};

export type ChecktableSeries = {
  id: string;
  label: string;
  hint?: string;
};

export type Checktable = {
  id: string;
  textbook: string;
  grade: string;
  version: string;
  updatedAt: string;
  basePath: string;
  series: ChecktableSeries[];
  sections: ChecktableSection[];
  supplementary: ChecktableItem[];
  /** Set to "mc-drive" for checktables generated from the scraped MC Drive
   *  tree. Used to group them on the Courseware page and keep them out of the
   *  per-student book dropdown unless grade-appropriate. Mock textbooks leave
   *  this undefined. */
  source?: "mc-drive";
  /** Product-line label for browse grouping, e.g. "SG (Letter Size)". */
  family?: string;
  /** Level folder label within the family, e.g. "SG Level 1". */
  levelLabel?: string;
};

/** A session a worksheet can be assigned to, used by the Courseware page's
 *  student-less assign flow (the session determines the student). */
export type AssignTarget = {
  sessionId: string;
  label: string; // full label, e.g. "2026-05-19 Tue 4:00 pm"
  studentId: string;
  studentName: string;
  tutorName: string;
  date: string; // session_date, YYYY-MM-DD, groups the multi-select list
  dateLabel: string; // "Tue 19 May"
  timeLabel: string; // "4:00 pm"
};

export type AssignmentStatus = "assigned" | "done";

export type ChecktableAssignment = {
  id: string;
  studentId: string;
  checktableId: string;
  itemId: string;
  status: AssignmentStatus;
  /** CW/HW this item was recorded as, when known (set via a session record).
   *  Lets the grid show classwork vs homework, not just assigned vs done. */
  kind?: ExerciseKind;
  assignedAt: string;
  doneAt?: string;
  pageRange?: string;
  tutorNote?: string;
  sessionLabel?: string; // e.g. "2026-05-19 Mon 4:00pm"
  sessionId?: string; // link to a real session (when picked)
  sourceRecordedExerciseId?: string; // set when this assignment was auto-created from a session record
};

// Assessment kanban types
export type AssessmentStage =
  | "booked"
  | "attended"
  | "follow-up"
  | "enrolled"
  | "lost";

export type Assessment = {
  id: string;
  childName: string;
  childGrade: string;
  /** School the child currently attends (as given at booking). */
  childSchool?: string;
  guardianName: string;
  guardianContact: string;
  bookedFor: string; // ISO
  source: string; // referral / walk-in / online
  stage: AssessmentStage;
  notes?: string;
  scorePct?: number; // after attended
  followUpDue?: string; // after attended
  /** Tutor who ran the assessment session. Set once attended. */
  assessingTutorName?: string;
  /** When stage transitions to "enrolled", this is set to the Student.id
   *  that was created from the conversion. Lets the student detail page
   *  surface the originating funnel record. */
  studentId?: string;
};

// -----------------------------------------------------------------------------
// CSM-aligned: Enrollment + Session + SessionStatus
// -----------------------------------------------------------------------------

/** Mirror of CSM's SessionStatus (webapp/frontend/types/index.ts).
 *  Keep in sync if the real values drift. */
export const SessionStatus = {
  SCHEDULED: "Scheduled",
  TRIAL_CLASS: "Trial Class",
  MAKEUP_CLASS: "Make-up Class",
  ATTENDED: "Attended",
  ATTENDED_MAKEUP: "Attended (Make-up)",
  NO_SHOW: "No Show",
  RESCHEDULED_PENDING: "Rescheduled - Pending Make-up",
  RESCHEDULED_BOOKED: "Rescheduled - Make-up Booked",
  SICK_LEAVE_PENDING: "Sick Leave - Pending Make-up",
  SICK_LEAVE_BOOKED: "Sick Leave - Make-up Booked",
  WEATHER_PENDING: "Weather Cancelled - Pending Make-up",
  WEATHER_BOOKED: "Weather Cancelled - Make-up Booked",
  CANCELLED: "Cancelled",
} as const;
export type SessionStatusValue =
  (typeof SessionStatus)[keyof typeof SessionStatus];

/** Mirrors CSM's enrollment_type, drives session generation rules.
 *  Assessment is a single trial-style lesson at a flat fee, tracked
 *  alongside the prospects funnel on the /assessments page. */
export type EnrollmentType = "Regular" | "Assessment" | "One-Time";

/** Mon=1 .. Sun=7, ISO weekday numbering. */
export type WeekdayNum = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** A student's enrollment with a tutor. A student can have many enrollments,
 *  and each enrollment has many sessions (typically lessons_paid of them). CSM
 *  has no "class" concept; an enrollment is just (student, tutor, term) with
 *  sessions slotted into recurring time_slots. */
export interface Enrollment {
  id: string;
  student_id: string;
  tutor_id: string;
  tutor_name: string;
  lessons_total: number;
  started_at: string; // YYYY-MM-DD
  /** CSM-aligned scheduling fields. Optional on legacy seeds; the create
   *  modal always sets them. */
  enrollment_type?: EnrollmentType;
  assigned_day?: WeekdayNum;
  assigned_time?: string; // "HH:MM"
  duration_mins?: number;
  room?: string;
  first_lesson_date?: string; // YYYY-MM-DD
  is_new_student?: boolean;
  remark?: string;
}

/** Row in the create-enrollment preview. A "lesson" row is a real session
 *  that will be written; a "skipped" row records a holiday that bumped a
 *  candidate date but is itself never written as a session. CSM shows
 *  both so the tutor can see *why* the schedule shifts. */
export type EnrollmentPreviewRow =
  | {
      kind: "lesson";
      lesson_number: number;
      session_date: string; // YYYY-MM-DD
    }
  | {
      kind: "skipped";
      session_date: string; // YYYY-MM-DD, the holiday date itself
      holiday_label: string;
    };

export type ExerciseKind = "CW" | "HW";

/** Exercise recorded against a specific session, mirroring CSM's
 *  SessionExercise. exercise_type is typed loosely (string) in CSM; the
 *  prototype constrains it to CW/HW which is the seed convention. */
export interface SessionExercise {
  id: string;
  session_id: string;
  exercise_type: ExerciseKind;
  pdf_name: string;
  /** Prototype-only link back to a ChecktableItem (CSM has no checktable). */
  item_id?: string;
  page_start?: number;
  page_end?: number;
  remarks?: string;
}

/** A scheduled occurrence of an enrollment for a single student. Mirrors
 *  CSM's Session: one row per student per occurrence. Sessions sharing
 *  (tutor_id, session_date, start_time) form a single "class meeting"
 *  that the UI groups into one card, there is no class entity in CSM,
 *  so meeting identity is derived purely from who is teaching when. */
export interface Session {
  id: string;
  enrollment_id: string;
  student_id: string;
  tutor_id: string;
  tutor_name: string;
  session_date: string; // YYYY-MM-DD
  start_time: string; // "HH:MM" 24-hour, treated as HKT
  duration_mins: number;
  room: string;
  lesson_number: number; // 0 means "not numbered" (e.g. ad-hoc make-up)
  session_status: SessionStatusValue;
  /** Free-form attendance qualifier (e.g. "Late"). session_status is the
   *  source of truth for state transitions; this is just a label. */
  attendance_status?: string;
  performance_rating?: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  /** Note shared across all sibling sessions of the same class meeting.
   *  Duplicated on each Session row for storage simplicity; the UI shows
   *  it once per group. */
  class_wide_note?: string;
  /** Set on a make-up session, pointing back to the original. */
  make_up_for_id?: string;
  /** Set on the original session once a make-up has been booked. */
  rescheduled_to_id?: string;
  /** For make-up sessions: the date of the root original session, used by
   *  the 60-day rule in CSM. */
  root_original_session_date?: string;
  cw: SessionExercise[];
  hw: SessionExercise[];
}

/** Record of homework being checked/submitted, mirroring CSM's
 *  HomeworkCompletion (webapp/frontend/types/index.ts:254+). In CSM the
 *  completion is typically recorded in the *next* session after the HW
 *  was assigned, current_session_id is where the check happened,
 *  session_exercise_id points back to the HW that was assigned. */
export interface HomeworkCompletion {
  id: string;
  current_session_id: string;
  session_exercise_id: string;
  student_id: string;
  submitted: boolean;
  completion_status?: string; // "Complete", "Partial", "Not done", etc.
  tutor_comments?: string;
  checked_by?: string;
  checked_at?: string; // ISO datetime
}

// Parent communications types
export type ContactMethod = "WhatsApp" | "Phone" | "In-Person";
export type ContactType = "Progress Update" | "Concern" | "General";
export type ContactStatus =
  | "Recent"
  | "Been a While"
  | "Contact Needed"
  | "Never Contacted";

export type ParentContact = {
  id: string;
  studentId: string;
  tutorName: string;
  method: ContactMethod;
  type: ContactType;
  contactedAt: string; // ISO
  briefNotes: string;
  followUpNeeded: boolean;
  followUpDate?: string; // ISO date
  followUpDone?: boolean;
};
