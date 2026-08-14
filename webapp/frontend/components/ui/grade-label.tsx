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

/**
 * The badge for a grade that is already the grade a student is *entering*,
 * which is what every application, slot and placement record holds, in both
 * the summer and the regular intake.
 *
 * It looks identical to GradeBadge and deliberately does none of its work: no
 * Pre- prefix, no promoted colour, ever. Promoting an entering grade moves it a
 * year further on, so an F4 application (a student entering F4) renders
 * "Pre-F5" through GradeBadge for as long as the summer window is open, and
 * then quietly starts reading correctly on 1 September, which is how the bug
 * survives being looked at.
 *
 * Pass the stream that governs placement rather than the raw submitted one:
 * the linked student's record where there is one, and International folded
 * into E otherwise, since a class is never International. `effective_stream`
 * on the backend and `foldStream` in lib/regular-utils are the two ways to get
 * it. An unrecognised grade-and-stream pair takes the neutral grade colour,
 * which is what a half-configured class should look like.
 *
 * Use GradeBadge only for a stored student grade on a surface that mixes
 * summer and non-summer students.
 */
export function EnteringGradeBadge({ grade, langStream, className, title }: GradeBadgeProps) {
  if (!grade) return null;
  return (
    <span
      className={className}
      title={title}
      style={{ backgroundColor: getGradeColor(grade, langStream ?? undefined) }}
    >
      {grade}
      {langStream ?? ""}
    </span>
  );
}
