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
    lang_stream: enrollment.lang_stream,
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
    school_student_id: session.school_student_id,
    student_name: session.student_name,
    grade: session.grade,
    lang_stream: session.lang_stream,
    school: session.school,
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

  // Use T00:00:00 suffix to ensure local timezone interpretation (not UTC)
  const date = new Date(data.session_date + 'T00:00:00');
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
  // Use T00:00:00 suffix to ensure local timezone interpretation (not UTC)
  const date = new Date(dateString + 'T00:00:00');
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = dayNames[date.getDay()];

  return `${dateString} (${dayName})`;
}

/**
 * Format date as short display string
 * Example: "Jan 15, 2025"
 */
export function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  // Use T00:00:00 suffix for date-only strings to ensure local timezone interpretation (not UTC)
  // This prevents day-off-by-one errors for users west of UTC
  const date = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format timestamp as relative time
 * Examples: "Just now", "5m ago", "2h ago", "Yesterday", "3d ago", "Jan 15"
 */
export function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Convert rating number to emoji stars
 * Example: 3 → "⭐⭐⭐"
 */
export function ratingToEmoji(rating: number): string {
  return "⭐".repeat(rating);
}

/**
 * Format date for proposal display
 * Example: "Sat, Jan 18, 2025"
 */
export function formatProposalDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
