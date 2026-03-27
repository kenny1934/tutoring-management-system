import { FileText, BookOpen } from "lucide-react";
import type { DocType } from "@/types";

export const DOC_TYPE_CONFIG: Record<DocType, {
  label: string;
  abbr: string;
  icon: typeof FileText;
  color: string;
  desc: string;
}> = {
  worksheet: {
    label: "Worksheet",
    abbr: "WS",
    icon: FileText,
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    desc: "Exercises, exams, practice sheets",
  },
  lesson_plan: {
    label: "Lesson Plan",
    abbr: "LP",
    icon: BookOpen,
    color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    desc: "Teaching guides and outlines",
  },
};
