import type { Enrollment, Session } from "../types";
import { SessionStatus } from "../types";

// Demo "today" used for headers
export const DEMO_DAY = "2026-05-19";

// Each student has one enrollment with their primary tutor. CSM enrollments
// don't carry a "class" — they're just (student, tutor, term) plus session
// rows slotted into recurring time_slots.
export const enrollments: Enrollment[] = [
  {
    id: "enr-001",
    student_id: "s-001",
    tutor_id: "t-wong",
    tutor_name: "Ms Wendy Wong",
    lessons_total: 8,
    started_at: "2026-03-04",
    enrollment_type: "Regular",
    assigned_day: 2, // Tue
    assigned_time: "16:00",
    duration_mins: 90,
    room: "Room 3",
    first_lesson_date: "2026-03-04",
  },
  {
    id: "enr-002",
    student_id: "s-002",
    tutor_id: "t-wong",
    tutor_name: "Ms Wendy Wong",
    lessons_total: 8,
    started_at: "2026-03-04",
    enrollment_type: "Regular",
    assigned_day: 2,
    assigned_time: "16:00",
    duration_mins: 90,
    room: "Room 3",
    first_lesson_date: "2026-03-04",
  },
  {
    id: "enr-003",
    student_id: "s-003",
    tutor_id: "t-wong",
    tutor_name: "Ms Wendy Wong",
    lessons_total: 8,
    started_at: "2026-04-08",
    enrollment_type: "Regular",
    assigned_day: 2,
    assigned_time: "16:00",
    duration_mins: 90,
    room: "Room 3",
    first_lesson_date: "2026-04-08",
  },
  {
    id: "enr-004",
    student_id: "s-004",
    tutor_id: "t-wong",
    tutor_name: "Ms Wendy Wong",
    lessons_total: 8,
    started_at: "2026-04-01",
    enrollment_type: "Regular",
    assigned_day: 2,
    assigned_time: "17:30",
    duration_mins: 90,
    room: "Room 2",
    first_lesson_date: "2026-04-01",
  },
];

/** Tutors available in the create-enrollment picker. */
export const tutors = [
  { id: "t-wong", name: "Ms Wendy Wong" },
  { id: "t-lee", name: "Mr Lawrence Lee" },
  { id: "t-chan", name: "Ms Karen Chan" },
];

/** Demo rooms available in the picker. */
export const rooms = ["Room 1", "Room 2", "Room 3", "Room 4"];

const wong = { tutor_id: "t-wong", tutor_name: "Ms Wendy Wong" };
const lee = { tutor_id: "t-lee", tutor_name: "Mr Lawrence Lee" };

// One Session row per student per occurrence. Rows sharing
// (tutor_id, session_date, start_time) form one class meeting that the
// UI groups — mirrors how CSM identifies a "class meeting" without ever
// storing a class entity.
export const sessions: Session[] = [
  // === Today (2026-05-19 16:00) — Ms Wong P6 meeting, lesson 12 ===
  {
    id: "sess-001-s-001",
    enrollment_id: "enr-001",
    student_id: "s-001",
    ...wong,
    session_date: "2026-05-19",
    start_time: "16:00",
    duration_mins: 90,
    room: "Room 3",
    lesson_number: 12,
    session_status: SessionStatus.ATTENDED,
    performance_rating: 4,
    notes: "Struggled on word problems, revisit next week",
    class_wide_note: "Cover percentage word problems thoroughly today.",
    cw: [
      { id: "rec-1", session_id: "sess-001-s-001", exercise_type: "CW", pdf_name: "609A", page_start: 1, page_end: 2 },
      { id: "rec-2", session_id: "sess-001-s-001", exercise_type: "CW", pdf_name: "609B" },
    ],
    hw: [
      { id: "rec-3", session_id: "sess-001-s-001", exercise_type: "HW", pdf_name: "609C" },
      { id: "rec-4", session_id: "sess-001-s-001", exercise_type: "HW", pdf_name: "609D" },
    ],
  },
  {
    id: "sess-001-s-002",
    enrollment_id: "enr-002",
    student_id: "s-002",
    ...wong,
    session_date: "2026-05-19",
    start_time: "16:00",
    duration_mins: 90,
    room: "Room 3",
    lesson_number: 12,
    session_status: SessionStatus.ATTENDED,
    performance_rating: 5,
    class_wide_note: "Cover percentage word problems thoroughly today.",
    cw: [
      { id: "rec-5", session_id: "sess-001-s-002", exercise_type: "CW", pdf_name: "516A" },
      { id: "rec-6", session_id: "sess-001-s-002", exercise_type: "CW", pdf_name: "516B" },
    ],
    hw: [
      { id: "rec-7", session_id: "sess-001-s-002", exercise_type: "HW", pdf_name: "C_Rev_6F_A02" },
    ],
  },
  {
    id: "sess-001-s-003",
    enrollment_id: "enr-003",
    student_id: "s-003",
    ...wong,
    session_date: "2026-05-19",
    start_time: "16:00",
    duration_mins: 90,
    room: "Room 3",
    lesson_number: 12,
    session_status: SessionStatus.ATTENDED,
    attendance_status: "Late",
    performance_rating: 3,
    notes: "Arrived 15 min late, sibling pickup issue",
    class_wide_note: "Cover percentage word problems thoroughly today.",
    cw: [{ id: "rec-8", session_id: "sess-001-s-003", exercise_type: "CW", pdf_name: "607A" }],
    hw: [],
  },

  // === Today (2026-05-19 17:30) — Ms Wong P5 meeting, lesson 9 ===
  {
    id: "sess-002-s-004",
    enrollment_id: "enr-004",
    student_id: "s-004",
    ...wong,
    session_date: "2026-05-19",
    start_time: "17:30",
    duration_mins: 90,
    room: "Room 2",
    lesson_number: 9,
    session_status: SessionStatus.SCHEDULED,
    cw: [],
    hw: [],
  },

  // === Make-up: s-001's previously-missed class on 2026-05-15 ===
  // Make-up session itself (will be attended)
  {
    id: "sess-003-makeup",
    enrollment_id: "enr-001",
    student_id: "s-001",
    ...lee,
    session_date: "2026-05-20",
    start_time: "16:00",
    duration_mins: 60,
    room: "Room 2",
    lesson_number: 0,
    session_status: SessionStatus.MAKEUP_CLASS,
    make_up_for_id: "sess-old-typhoon",
    root_original_session_date: "2026-05-15",
    cw: [],
    hw: [],
  },
  // Original session that the make-up replaces (cancelled by weather, now
  // marked as booked-and-rescheduled). Friday slot (not the Tue recurrence)
  // — this was itself an ad-hoc session for enr-001, so lesson_number 0
  // per the convention in types.ts (Session.lesson_number).
  {
    id: "sess-old-typhoon",
    enrollment_id: "enr-001",
    student_id: "s-001",
    ...wong,
    session_date: "2026-05-15",
    start_time: "16:00",
    duration_mins: 90,
    room: "Room 3",
    lesson_number: 0,
    session_status: SessionStatus.WEATHER_BOOKED,
    rescheduled_to_id: "sess-003-makeup",
    notes: "Typhoon closure — make-up booked for 2026-05-20.",
    cw: [],
    hw: [],
  },

  // === Last week (2026-05-12 16:00) — Ms Wong P6 meeting, lesson 11 ===
  {
    id: "sess-004-s-001",
    enrollment_id: "enr-001",
    student_id: "s-001",
    ...wong,
    session_date: "2026-05-12",
    start_time: "16:00",
    duration_mins: 90,
    room: "Room 3",
    lesson_number: 11,
    session_status: SessionStatus.ATTENDED,
    performance_rating: 4,
    cw: [{ id: "rec-h1", session_id: "sess-004-s-001", exercise_type: "CW", pdf_name: "608A" }],
    hw: [
      { id: "rec-h2", session_id: "sess-004-s-001", exercise_type: "HW", pdf_name: "608B" },
      { id: "rec-h3", session_id: "sess-004-s-001", exercise_type: "HW", pdf_name: "extra/602" },
      { id: "rec-h5", session_id: "sess-004-s-001", exercise_type: "HW", pdf_name: "609A", page_start: 3, page_end: 4 },
    ],
  },
  {
    id: "sess-004-s-002",
    enrollment_id: "enr-002",
    student_id: "s-002",
    ...wong,
    session_date: "2026-05-12",
    start_time: "16:00",
    duration_mins: 90,
    room: "Room 3",
    lesson_number: 11,
    session_status: SessionStatus.SICK_LEAVE_PENDING,
    notes: "Sick leave, owed makeup",
    cw: [],
    hw: [],
  },
  {
    id: "sess-004-s-003",
    enrollment_id: "enr-003",
    student_id: "s-003",
    ...wong,
    session_date: "2026-05-12",
    start_time: "16:00",
    duration_mins: 90,
    room: "Room 3",
    lesson_number: 11,
    session_status: SessionStatus.ATTENDED,
    performance_rating: 3,
    cw: [{ id: "rec-h4", session_id: "sess-004-s-003", exercise_type: "CW", pdf_name: "607B" }],
    hw: [
      { id: "rec-h6", session_id: "sess-004-s-003", exercise_type: "HW", pdf_name: "607C", page_start: 1, page_end: 2 },
      { id: "rec-h7", session_id: "sess-004-s-003", exercise_type: "HW", pdf_name: "C_Rev_6F_A01" },
    ],
  },
];

// Mock makeup suggestions for the "Schedule makeup" panel.
// Each carries a session template so confirming the makeup can spin up a
// new Session with realistic time-slot/room/tutor inheritance.
export const makeupSuggestions = [
  {
    id: "ms-1",
    day: "Wed 20 May",
    time: "4:00pm",
    fit: "best",
    rationale: "Same tutor (Ms Wendy Wong), 2 free seats in that slot",
    session_date: "2026-05-20",
    start_time: "16:00",
    room: "201",
    tutor_id: "t-wong",
    tutor_name: "Ms Wendy Wong",
    duration_mins: 90,
  },
  {
    id: "ms-2",
    day: "Fri 22 May",
    time: "5:30pm",
    fit: "good",
    rationale: "Different tutor (Mr Lawrence Lee), same level",
    session_date: "2026-05-22",
    start_time: "17:30",
    room: "104",
    tutor_id: "t-lee",
    tutor_name: "Mr Lawrence Lee",
    duration_mins: 90,
  },
  {
    id: "ms-3",
    day: "Sat 23 May",
    time: "11:00am",
    fit: "stretch",
    rationale: "Outside student's usual window",
    session_date: "2026-05-23",
    start_time: "11:00",
    room: "204",
    tutor_id: "t-chan",
    tutor_name: "Ms Karen Chan",
    duration_mins: 90,
  },
] as const;

export type MakeupSuggestion = (typeof makeupSuggestions)[number];
