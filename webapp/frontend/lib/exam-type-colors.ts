// Canonical event type colours — the exam revisions page set the
// convention (Test red, Exam purple, Quiz green, anything else muted) and
// every surface that colours a test kind must read from here, not define
// its own palette.
export const EXAM_TYPE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Test: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", dot: "bg-red-500" },
  Exam: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300", dot: "bg-purple-500" },
  Quiz: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300", dot: "bg-green-500" },
};

export const DEFAULT_TYPE_COLORS = { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-400", dot: "bg-gray-400" };

export const getTypeColors = (eventType?: string | null) =>
  EXAM_TYPE_COLORS[eventType || ""] || DEFAULT_TYPE_COLORS;
