"use client";

import { useCallback, useState } from "react";
import type { SessionExercise } from "@/types";

/**
 * The Draft beside the worksheet, where the class works on blank or squared
 * paper next to the question. It only opens with a worksheet on screen, and
 * only on a big screen: a link has no pages to work beside, and a phone has
 * no room. Opening it is remembered, so it comes back when the tutor returns
 * from a link to a worksheet.
 */
export function useDraft(exercise: Pick<SessionExercise, "url" | "pdf_name"> | null, isMobile: boolean) {
  const [showDraft, setShowDraft] = useState(false);
  // While the Draft is open, the Pen Tray floats in a lane over the worksheet
  // and the Draft together.
  const [trayArea, setTrayArea] = useState<HTMLElement | null>(null);

  const isLink = !!exercise?.url && !exercise?.pdf_name;
  const draftOpen = showDraft && !isMobile && !!exercise && !isLink;
  const toggleDraft = useCallback(() => setShowDraft((open) => !open), []);
  const closeDraft = useCallback(() => setShowDraft(false), []);

  return { draftOpen, toggleDraft, closeDraft, trayArea, setTrayArea };
}
