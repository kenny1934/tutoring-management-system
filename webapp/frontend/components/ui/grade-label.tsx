"use client";

import { getGradeColor } from "@/lib/constants";
import { displayGrade, gradeColorKey } from "@/lib/grade-utils";
import { useSummerPreGradeWindow } from "@/lib/hooks/useSummerPreGradeWindow";

interface GradeLabelProps {
  grade?: string | null;
  langStream?: string | null;
}

/**
 * Grade + language stream text ("P6E") that swaps to the transitional
 * "Pre-Fx" form during the summer pre-grade window ("Pre-F1E"). Drop-in
 * replacement for inline `{x.grade}{x.lang_stream || ""}` renderings so the
 * whole app flips together.
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

/**
 * Badge colour matching what GradeLabel displays: during the window a
 * stored P6E badge shows "Pre-F1E" and takes F1E's colour. Use wherever a
 * badge shows GradeLabel text; keep plain getGradeColor for raw renderings
 * (summer pages, class labels, charts).
 */
export function useGradeColor(grade?: string | null, langStream?: string | null): string {
  const preGradeWindow = useSummerPreGradeWindow();
  return getGradeColor(gradeColorKey(grade, preGradeWindow), langStream ?? undefined);
}

interface GradeBadgeProps extends GradeLabelProps {
  className?: string;
  title?: string;
  /** Some dense badges colour by grade+stream but show the grade alone. */
  showStream?: boolean;
}

/**
 * The standard grade badge span — window-aware text (GradeLabel) plus the
 * matching background colour in one component, so the two can't drift.
 */
export function GradeBadge({ grade, langStream, className, title, showStream = true }: GradeBadgeProps) {
  const backgroundColor = useGradeColor(grade, langStream);
  if (!grade) return null;
  return (
    <span className={className} title={title} style={{ backgroundColor }}>
      <GradeLabel grade={grade} langStream={showStream ? langStream : undefined} />
    </span>
  );
}
