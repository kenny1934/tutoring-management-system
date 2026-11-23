import type { SearchResults } from "@/types";
import { getDisplayPaymentStatus } from "@/lib/enrollment-utils";

export function formatSearchDate(value?: string | null): string {
  if (!value) return '';
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
export function sessionLabel(session: SearchResults['sessions'][number]): string {
  return [formatSearchDate(session.session_date), session.time_slot, session.tutor_name, session.location, session.session_status].filter(Boolean).join(' · ');
}
export function enrollmentLabel(enrollment: SearchResults['enrollments'][number]): string {
  return [[enrollment.assigned_day, enrollment.assigned_time].filter(Boolean).join(' '),
    enrollment.first_lesson_date ? `Started ${formatSearchDate(enrollment.first_lesson_date)}` : null,
    enrollment.tutor_name, enrollment.location, enrollment.enrollment_type,
    getDisplayPaymentStatus(enrollment)].filter(Boolean).join(' · ');
}
