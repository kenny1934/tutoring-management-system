"use client";

import { useCallback, useState } from "react";
import type { SessionExercise } from "@/types";

/**
 * The Draft, where the class works on blank or squared paper. Each exercise
 * has its own, which opens beside its worksheet, and the lesson has one of
 * its own too, which fills the viewer in the worksheet's place. The lesson's
 * Draft is how a tutor starts working before the lesson has any courseware,
 * and the sidebar's "Lesson draft" row brings it back once it has some.
 *
 * Neither opens on a phone, which has no room for them. An exercise's Draft
 * only opens beside a worksheet, because a link has no pages to work beside,
 * and opening it is remembered, so it comes back when the tutor returns from
 * a link to a worksheet. While the lesson's Draft is on screen, the
 * exercise's is out of sight along with its worksheet.
 */
export function useDraft(exercise: Pick<SessionExercise, "url" | "pdf_name"> | null, isMobile: boolean) {
  const [showDraft, setShowDraft] = useState(false);
  const [lessonDraftShown, setLessonDraftShown] = useState(false);
  // While an exercise's Draft is open, the Pen Tray floats in a lane over the
  // worksheet and the Draft together.
  const [trayArea, setTrayArea] = useState<HTMLElement | null>(null);

  const lessonDraftOpen = lessonDraftShown && !isMobile;
  const isLink = !!exercise?.url && !exercise?.pdf_name;
  const draftOpen = showDraft && !isMobile && !!exercise && !isLink && !lessonDraftOpen;
  const toggleDraft = useCallback(() => setShowDraft((open) => !open), []);
  const closeDraft = useCallback(() => setShowDraft(false), []);
  const openLessonDraft = useCallback(() => setLessonDraftShown(true), []);
  const closeLessonDraft = useCallback(() => setLessonDraftShown(false), []);

  return {
    /** Whether the open exercise's Draft is beside its worksheet. */
    draftOpen,
    toggleDraft,
    closeDraft,
    /** Whether the lesson's own Draft is on screen, in place of the open exercise. */
    lessonDraftOpen,
    openLessonDraft,
    closeLessonDraft,
    /** The lane for the Pen Tray, only while an exercise's Draft is open. Otherwise the tray stays in its viewer. */
    trayArea: draftOpen ? trayArea : undefined,
    setTrayArea,
  };
}
