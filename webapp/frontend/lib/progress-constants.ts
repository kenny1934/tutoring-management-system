// Shared color constants and formatters for student progress drawer + report

export const ATTENDANCE_COLORS = {
  attended: "#a0704b",
  no_show: "#dc2626",
  rescheduled: "#d97706",
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

export const CONCEPT_CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Algebra: { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
  Geometry: { bg: "#dbeafe", border: "#3b82f6", text: "#1e3a5f" },
  Arithmetic: { bg: "#d1fae5", border: "#10b981", text: "#065f46" },
  Statistics: { bg: "#ede9fe", border: "#8b5cf6", text: "#5b21b6" },
  Trigonometry: { bg: "#fce7f3", border: "#ec4899", text: "#9d174d" },
  "Number Theory": { bg: "#ffedd5", border: "#f97316", text: "#9a3412" },
  Other: { bg: "#f3f4f6", border: "#9ca3af", text: "#374151" },
};

export function getConceptCategoryColors(category?: string) {
  return CONCEPT_CATEGORY_COLORS[category || "Other"] || CONCEPT_CATEGORY_COLORS.Other;
}
