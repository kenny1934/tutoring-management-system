"use client";

import { displayGrade } from "@/lib/grade-utils";
import { useSummerPreGradeWindow } from "@/lib/hooks/useSummerPreGradeWindow";

interface GradeLabelProps {
  grade?: string | null;
  langStream?: string | null;
}

/**
 * Grade + language stream text ("P6E") that swaps to the transitional
 * "Pre-Fx" form during the summer pre-grade window ("Pre-F1E"). Drop-in
 * replacement for inline `{x.grade}{x.lang_stream || ""}` renderings so the
 * whole app flips together. Text only — grade colors stay keyed on the raw
 * stored grade.
 *
 * For stored student grades on shared surfaces only. Summer application /
 * slot / placement data already holds the entering grade (F1-F4 prep
 * classes) and renders it as plain text — no Pre- transform needed there.
 */
export function GradeLabel({ grade, langStream }: GradeLabelProps) {
  const preGradeWindow = useSummerPreGradeWindow();
  if (!grade) return null;
  return <>{displayGrade(grade, preGradeWindow)}{langStream || ""}</>;
}
