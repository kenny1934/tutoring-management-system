import type { ParentContact } from "../types";

// Pinned demo "now" so status badges and follow-up urgency stay stable.
export const DEMO_NOW = "2026-05-19T09:00:00+08:00";

export const parentContacts: ParentContact[] = [
  // Chan Ho Yin (s-001) — recent, no follow-up needed
  {
    id: "pc-001",
    studentId: "s-001",
    tutorName: "Ms. Wong",
    method: "WhatsApp",
    type: "Progress Update",
    contactedAt: "2026-05-15T15:30:00+08:00",
    briefNotes:
      "Shared this week's performance. Parent happy with the move to harder problems.",
    followUpNeeded: false,
  },
  {
    id: "pc-002",
    studentId: "s-001",
    tutorName: "Ms. Wong",
    method: "Phone",
    type: "General",
    contactedAt: "2026-04-22T18:00:00+08:00",
    briefNotes: "Discussed summer course options.",
    followUpNeeded: false,
  },

  // Wong Mei Ling (s-002) — concern raised, follow-up overdue
  {
    id: "pc-101",
    studentId: "s-002",
    tutorName: "Ms. Wong",
    method: "WhatsApp",
    type: "Concern",
    contactedAt: "2026-05-08T10:00:00+08:00",
    briefNotes:
      "Mei Ling missed last week due to illness. Parent confirms she'll attend Friday's makeup. Need to confirm she's caught up.",
    followUpNeeded: true,
    followUpDate: "2026-05-16",
    followUpDone: false,
  },

  // Lee Tsz Kit (s-003) — been a while
  {
    id: "pc-201",
    studentId: "s-003",
    tutorName: "Mr. Lee",
    method: "WhatsApp",
    type: "General",
    contactedAt: "2026-03-28T14:00:00+08:00",
    briefNotes: "Welcome message, set expectations for first month.",
    followUpNeeded: false,
  },

  // Ng Wing Yan (s-004) — concern, follow-up due tomorrow
  {
    id: "pc-301",
    studentId: "s-004",
    tutorName: "Mr. Lee",
    method: "In-Person",
    type: "Concern",
    contactedAt: "2026-05-17T17:00:00+08:00",
    briefNotes:
      "Wing Yan has been distracted in class. Parent says home routine has been busy. Agreed to check in next week.",
    followUpNeeded: true,
    followUpDate: "2026-05-20",
    followUpDone: false,
  },
  {
    id: "pc-302",
    studentId: "s-004",
    tutorName: "Mr. Lee",
    method: "Phone",
    type: "Progress Update",
    contactedAt: "2026-04-10T16:00:00+08:00",
    briefNotes: "Mid-term progress update, scores improving in arithmetic.",
    followUpNeeded: false,
  },
];

export function contactStatusFor(
  studentId: string,
  contacts: ParentContact[],
  nowIso: string = DEMO_NOW
): "Recent" | "Been a While" | "Contact Needed" | "Never Contacted" {
  const last = contacts
    .filter((c) => c.studentId === studentId)
    .sort((a, b) => b.contactedAt.localeCompare(a.contactedAt))[0];
  if (!last) return "Never Contacted";
  const days = Math.floor(
    (new Date(nowIso).getTime() - new Date(last.contactedAt).getTime()) /
      86400000
  );
  if (days <= 14) return "Recent";
  if (days <= 30) return "Been a While";
  return "Contact Needed";
}
