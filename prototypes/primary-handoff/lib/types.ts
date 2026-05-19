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
