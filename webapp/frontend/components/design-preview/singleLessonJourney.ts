import type { Session } from "@/types";
import { requestLessonOpening } from "./lessonFrame";
import { lessonHref } from "./lessonJourney";

/** Details and list popovers open the same one-student workspace over their mounted source. */
export function requestSingleLesson(session: Session, source: HTMLElement, options: {
  panel?: HTMLElement | null;
  returnFocus?: HTMLElement | null;
  beforeNavigate?: () => void;
} = {}) {
  const panel = options.panel ?? source.closest<HTMLElement>("[data-native-session-chalkboard]") ?? source;
  return requestLessonOpening({
    kind: "single", href: lessonHref(`/sessions/${session.id}?lesson=true`), source,
    returnFocus: options.returnFocus ?? source, beforeNavigate: options.beforeNavigate,
    identity: panel.querySelector<HTMLElement>("[data-native-session-target], [data-native-session-identity]"),
    from: panel.getBoundingClientRect(),
    tutor: session.tutor_name ?? "", slot: session.time_slot, date: session.session_date,
    location: session.location ?? "", student: session.student_name ?? "", grade: session.grade, school: session.school,
  });
}
