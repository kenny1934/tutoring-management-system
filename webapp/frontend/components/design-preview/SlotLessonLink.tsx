"use client";

import { Presentation } from "lucide-react";
import { buttonClasses } from "@/components/controls/button";
import { lessonHref } from "./lessonJourney";
import { requestLessonOpening } from "./lessonFrame";
import { useNativePresentation } from "./useNativePresentation";

/** The time-slot header opens its whole class, without choosing an individual student. */
export function SlotLessonLink({ date, slot, tutorId, tutor, location }: {
  date: string; slot: string; tutorId: string; tutor: string; location: string;
}) {
  const mode = useNativePresentation();
  const params = new URLSearchParams({ date, slot, tutor_id: tutorId });
  const href = lessonHref(`/sessions/lesson?${params}`);
  return <a href={href} target="_blank" rel="noopener noreferrer"
    className={buttonClasses({ size: "sm" })}
    title="Open lesson mode for this time slot" aria-label="Lesson mode"
    onClick={event => {
      event.stopPropagation();
      if (mode !== "motion" || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const source = event.currentTarget;
      const header = source.closest<HTMLElement>("[data-native-lesson-slot]") ?? source;
      if (requestLessonOpening({ href, source, from: header.getBoundingClientRect(),
        identity: header.querySelector("h3"), date, slot, tutor, location })) event.preventDefault();
    }}>
    <Presentation className="h-3.5 w-3.5 flex-shrink-0 text-ink-subtle" aria-hidden="true" />
    <span className="max-sm:hidden">Lesson</span>
  </a>;
}
