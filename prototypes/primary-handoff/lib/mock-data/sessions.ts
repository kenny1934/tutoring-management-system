import type { ClassSession } from "../types";

// Demo "today" used for headers
export const DEMO_DAY = "2026-05-19";

export const sessions: ClassSession[] = [
  {
    id: "sess-001",
    className: "P6 Math · Group A",
    classCode: "P6-MA-WED",
    startAt: "2026-05-19T16:00:00+08:00",
    durationMins: 90,
    room: "Room 3",
    tutorName: "Ms. Wong",
    lessonNumber: 12,
    students: [
      {
        studentId: "s-001",
        attendance: "present",
        performance: 4,
        cw: [
          { id: "rec-1", kind: "CW", itemCode: "609A", pageRange: "1-2" },
          { id: "rec-2", kind: "CW", itemCode: "609B" },
        ],
        hw: [
          { id: "rec-3", kind: "HW", itemCode: "609C" },
          { id: "rec-4", kind: "HW", itemCode: "609D" },
        ],
        note: "Struggled on word problems, revisit next week",
      },
      {
        studentId: "s-002",
        attendance: "present",
        performance: 5,
        cw: [
          { id: "rec-5", kind: "CW", itemCode: "516A" },
          { id: "rec-6", kind: "CW", itemCode: "516B" },
        ],
        hw: [
          { id: "rec-7", kind: "HW", itemCode: "C_Rev_6F_A02" },
        ],
      },
      {
        studentId: "s-003",
        attendance: "late",
        performance: 3,
        cw: [{ id: "rec-8", kind: "CW", itemCode: "607A" }],
        hw: [],
        note: "Arrived 15 min late, sibling pickup issue",
      },
    ],
    classWideNote: "Cover percentage word problems thoroughly today.",
  },
  {
    id: "sess-002",
    className: "P5 Math · Group B",
    classCode: "P5-MB-WED",
    startAt: "2026-05-19T17:30:00+08:00",
    durationMins: 90,
    room: "Room 1",
    tutorName: "Ms. Wong",
    lessonNumber: 9,
    students: [
      {
        studentId: "s-004",
        attendance: "pending",
        cw: [],
        hw: [],
      },
    ],
  },
  {
    id: "sess-003",
    className: "Makeup · Chan Ho Yin",
    classCode: "MAKEUP",
    startAt: "2026-05-20T16:00:00+08:00",
    durationMins: 60,
    room: "Room 2",
    tutorName: "Mr. Lee",
    lessonNumber: 0,
    isMakeup: true,
    rescheduledFrom: "Original: 2026-05-15 Fri 4:00pm — typhoon closure",
    students: [
      {
        studentId: "s-001",
        attendance: "pending",
        cw: [],
        hw: [],
      },
    ],
  },
  {
    id: "sess-004",
    className: "P6 Math · Group A",
    classCode: "P6-MA-WED",
    startAt: "2026-05-12T16:00:00+08:00",
    durationMins: 90,
    room: "Room 3",
    tutorName: "Ms. Wong",
    lessonNumber: 11,
    students: [
      {
        studentId: "s-001",
        attendance: "present",
        performance: 4,
        cw: [{ id: "rec-h1", kind: "CW", itemCode: "608A" }],
        hw: [
          { id: "rec-h2", kind: "HW", itemCode: "608B" },
          { id: "rec-h3", kind: "HW", itemCode: "extra/602" },
        ],
      },
      {
        studentId: "s-002",
        attendance: "absent",
        cw: [],
        hw: [],
        note: "Sick leave, owed makeup",
      },
      {
        studentId: "s-003",
        attendance: "present",
        performance: 3,
        cw: [{ id: "rec-h4", kind: "CW", itemCode: "607B" }],
        hw: [],
      },
    ],
  },
];

// Mock makeup suggestions for the "Schedule makeup" panel
export const makeupSuggestions = [
  {
    id: "ms-1",
    day: "Wed 22 May",
    time: "4:00pm",
    fit: "best",
    rationale: "Same tutor (Ms. Wong), class has 2 free seats",
    classCode: "P6-MA-WED",
  },
  {
    id: "ms-2",
    day: "Fri 24 May",
    time: "5:30pm",
    fit: "good",
    rationale: "Different tutor (Mr. Lee), same level",
    classCode: "P6-MA-FRI",
  },
  {
    id: "ms-3",
    day: "Sat 25 May",
    time: "11:00am",
    fit: "stretch",
    rationale: "Outside student's usual window",
    classCode: "P6-MA-SAT",
  },
] as const;
