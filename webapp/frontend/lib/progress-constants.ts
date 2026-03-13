// Shared color constants and formatters for student progress drawer + report

export const ATTENDANCE_COLORS = {
  attended: "#a0704b",
  no_show: "#dc2626",
  rescheduled: "#d97706",
  cancelled: "#9ca3af",
} as const;

export const CHART_COLORS = {
  sessions: "#a0704b",
  exercises: "#cd853f",
  rating: "#f59e0b",
  grid: "#e8d4b8",
} as const;

export const DATA_KEY_LABELS: Record<string, string> = {
  sessions_attended: "Sessions",
  exercises_assigned: "Exercises",
  avg_rating: "Avg Rating",
};

export function formatMonthLabel(month: string): string {
  return month.slice(2).replace("-", "/"); // "2025-01" -> "25/01"
}
