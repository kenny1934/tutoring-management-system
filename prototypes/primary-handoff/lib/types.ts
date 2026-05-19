// Shared types across prototypes. Mock-only.

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
};

export type ChecktableCell = {
  items: ChecktableItem[];
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
};

export type AssignmentStatus = "assigned" | "done";

export type ChecktableAssignment = {
  id: string;
  studentId: string;
  checktableId: string;
  itemId: string;
  status: AssignmentStatus;
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
  guardianName: string;
  guardianContact: string;
  bookedFor: string; // ISO
  source: string; // referral / walk-in / online
  stage: AssessmentStage;
  notes?: string;
  scorePct?: number; // after attended
  followUpDue?: string; // after attended
};

// Sessions types
export type AttendanceStatus =
  | "pending"
  | "present"
  | "absent"
  | "late"
  | "makeup";

export type ExerciseKind = "CW" | "HW";

export type RecordedExercise = {
  id: string;
  kind: ExerciseKind;
  itemCode: string; // pulled from checktable, e.g. "607A"
  itemId?: string; // optional checktable item id link
  pageRange?: string;
  note?: string;
  sessionId?: string; // back-reference to source session
};

export type SessionStudent = {
  studentId: string;
  attendance: AttendanceStatus;
  performance?: 1 | 2 | 3 | 4 | 5;
  cw: RecordedExercise[];
  hw: RecordedExercise[];
  note?: string;
};

export type ClassSession = {
  id: string;
  className: string;
  classCode: string;
  startAt: string; // ISO
  durationMins: number;
  room: string;
  tutorName: string;
  lessonNumber: number;
  students: SessionStudent[];
  rescheduledFrom?: string; // human label
  isMakeup?: boolean;
  classWideNote?: string;
};

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
