import type { TutorAssisting } from "@/types";
import { formatDayFirstDate } from "@/lib/formatters";

/** Tutors see a warning when preparing exercises for another tutor's session. */
export function hasExerciseTutorMismatch(args: {
  lessonTutorId: number | null | undefined;
  viewerId: number | null | undefined;
  effectiveRole: string | null;
}): boolean {
  return args.effectiveRole === "Tutor" && args.viewerId != null &&
    args.lessonTutorId != null && args.lessonTutorId !== args.viewerId;
}

/**
 * The link read back as a phrase for the tutor cards, such as "Assists Miss
 * Bella until 31 Dec 2026". `names` maps tutor ids to names, and an id that
 * isn't in it shows as "tutor 12" so a link is never silently left out.
 */
export function assistingLabel(link: TutorAssisting, names: Map<number, string>): string {
  const lead = names.get(link.lead_tutor_id) ?? `tutor ${link.lead_tutor_id}`;
  return link.effective_until
    ? `Assists ${lead} until ${formatDayFirstDate(link.effective_until)}`
    : `Assists ${lead}`;
}
