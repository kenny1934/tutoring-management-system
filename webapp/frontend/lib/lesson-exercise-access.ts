import type { Tutor, TutorAssisting } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { useTutors } from "@/lib/hooks";
import { hkTodayIso } from "@/lib/summer-utils";
import { formatDayFirstDate } from "@/lib/formatters";

/**
 * Whether an assistant link still holds on the given day. A link without an
 * end date lasts until an admin removes it, and one with an end date still
 * counts on that last day. The backend applies the same rule when it saves.
 */
export function assistingHolds(link: TutorAssisting, todayIso: string): boolean {
  return !link.effective_until || link.effective_until >= todayIso;
}

/**
 * Whether the viewer may change the classwork and homework of a lesson
 * taught by `lessonTutorId`. That is the lesson's own tutor, an admin, or a
 * tutor with an active link saying they assist the lesson's tutor. Everybody
 * else can still open the exercise window, but only to look.
 *
 * `viewer` is null while the tutor list is still loading. Only the assistant
 * case needs it, so an owner or an admin gets their answer straight away.
 */
export function canChangeLessonExercises(args: {
  lessonTutorId: number | null | undefined;
  viewerId: number | null | undefined;
  isAdmin: boolean;
  viewer: Pick<Tutor, "assisting"> | null | undefined;
  todayIso: string;
}): boolean {
  const { lessonTutorId, viewerId, isAdmin, viewer, todayIso } = args;
  if (isAdmin) return true;
  if (viewerId == null || lessonTutorId == null) return false;
  if (lessonTutorId === viewerId) return true;
  return (viewer?.assisting ?? []).some(
    (link) => link.lead_tutor_id === lessonTutorId && assistingHolds(link, todayIso),
  );
}

/**
 * The hook form of canChangeLessonExercises for the signed-in viewer. It
 * follows impersonation, so an admin viewing as a tutor sees what that tutor
 * would see.
 */
export function useCanChangeLessonExercises(lessonTutorId: number | null | undefined): boolean {
  const { user, isAdmin, impersonatedTutor } = useAuth();
  const { data: tutors } = useTutors();
  const viewerId = impersonatedTutor?.id ?? user?.id;
  return canChangeLessonExercises({
    lessonTutorId,
    viewerId,
    isAdmin,
    viewer: tutors?.find((t) => t.id === viewerId),
    todayIso: hkTodayIso(),
  });
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
