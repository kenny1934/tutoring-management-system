import type { Student, Enrollment, Session } from "@/types";

/**
 * Format student display following CSM Pro pattern:
 * {location} {school_student_id} {student_name} {grade}{lang_stream} {school}
 *
 * Example: "MSA 1968 Adalia Lee F1E SRL-E"
 */
export function formatStudentDisplay(data: {
  location?: string;
  school_student_id?: string;
  student_name?: string;
  grade?: string;
  lang_stream?: string;
  school?: string;
}): string {
  const parts: string[] = [];

  if (data.location) parts.push(data.location);
  if (data.school_student_id) parts.push(data.school_student_id);
  if (data.student_name) parts.push(data.student_name);

  // Combine grade and lang_stream
  const gradeLang = [data.grade, data.lang_stream].filter(Boolean).join('');
  if (gradeLang) parts.push(gradeLang);

  if (data.school) parts.push(data.school);

  return parts.join(' ') || 'N/A';
}

/**
 * Format student header for detail pages:
 * {location}-{school_student_id} {student_name}
 *
 * Example: "MSA-1968 Adalia Lee"
 */
export function formatStudentHeader(data: {
  location?: string;
  school_student_id?: string;
  student_name?: string;
}): string {
  const locationId = [data.location, data.school_student_id].filter(Boolean).join('-');
  const parts = [locationId, data.student_name].filter(Boolean);

  return parts.join(' ') || 'N/A';
}

/**
 * Format enrollment display for lists/tables:
 * {location} {school_student_id} {student_name} {grade}{lang_stream} {school}
 */
export function formatEnrollmentDisplay(enrollment: Enrollment): string {
  return formatStudentDisplay({
    location: enrollment.location,
    school_student_id: enrollment.student?.school_student_id,
    student_name: enrollment.student_name,
    grade: enrollment.grade,
    lang_stream: enrollment.student?.lang_stream,
    school: enrollment.school,
  });
}

/**
 * Format session display for schedules/lists
 * {location} {school_student_id} {student_name} {grade}{lang_stream} {school}
 */
export function formatSessionDisplay(session: Session): string {
  return formatStudentDisplay({
    location: session.location,
    school_student_id: session.student?.school_student_id,
    student_name: session.student_name,
    grade: session.student?.grade,
    lang_stream: session.student?.lang_stream,
    school: session.student?.school,
  });
}

/**
 * Format datetime with day of week and optional tutor:
 * {date} ({day}) ● {time} — Tutor: {tutor_name}
 *
 * Example: "2025-10-13 (Mon) ● 16:45 - 18:15 — Tutor: Ms Bella Chang"
 */
export function formatSessionDateTime(data: {
  session_date?: string;
  time_slot?: string;
  tutor_name?: string;
}): string {
  if (!data.session_date) return 'N/A';

  const date = new Date(data.session_date);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = dayNames[date.getDay()];

  const parts = [
    `${data.session_date} (${dayName})`,
  ];

  if (data.time_slot) {
    parts.push('●', data.time_slot);
  }

  if (data.tutor_name) {
    parts.push('—', `Tutor: ${data.tutor_name}`);
  }

  return parts.join(' ');
}

/**
 * Format date with day of week:
 * {date} ({day})
 *
 * Example: "2025-10-13 (Mon)"
 */
export function formatDateWithDay(dateString: string): string {
  const date = new Date(dateString);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = dayNames[date.getDay()];

  return `${dateString} (${dayName})`;
}
