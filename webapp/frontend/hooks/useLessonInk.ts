"use client";

import { useCallback, useEffect, useState } from "react";
import {
  lessonOfDraft, useAnnotations, type PageAnnotations, type ReplacedInk, type Stroke,
} from "@/hooks/useAnnotations";
import { useAnnotationTools } from "@/hooks/useAnnotationTools";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { inkLocation, replacedInkMessage } from "@/lib/lesson-utils";
import type { SessionExercise } from "@/types";

interface LessonInkOptions<Source> {
  /** Where this tab keeps ink that hasn't reached the server yet. */
  storageKey: string;
  /** The lessons whose ink is loaded and saved. */
  sessionIds: number[];
  /** Every exercise the view lists, so ink on any of them can be saved. */
  exercises: SessionExercise[];
  /** The exercise on screen. It can be a preview, which no list has. */
  openExercise: SessionExercise | null;
  /**
   * How Download All saves the open exercise. It's kept beside the ink, so
   * the ink can still be saved once the exercise has left the lists, as a
   * preview has after a reload. Keep it the same object while the exercise
   * is, or it's stored again on every render.
   */
  openSource: Source | null;
  /**
   * The id of the lesson's own Draft while it's on screen in the open
   * exercise's place, or null. While it's on screen, the Pen Tray and every
   * handler work on that Draft's ink, and the exercise is only waiting to be
   * shown again.
   */
  lessonDraftId?: number | null;
}

/**
 * The ink for both lesson views: the Pen Tray's tools, the open exercise's
 * strokes, and the handlers the worksheet and the Draft draw through. Ink is
 * saved to the server for the view's lessons, and the tab keeps whatever
 * hasn't reached it yet.
 *
 * Drawing waits on the Hand until the lessons' ink has loaded. A stroke drawn
 * before then could replace a page's saved ink with only that stroke. When
 * someone else, or another tab, changes a page of the worksheet on screen,
 * the tutor is told. Any other worksheet just shows the new ink the next time
 * it's opened.
 *
 * The handlers only change when a different exercise is opened, so the
 * pages they're handed to don't re-render with every stroke.
 */
export function useLessonInk<Source>({
  storageKey, sessionIds, exercises, openExercise, openSource, lessonDraftId = null,
}: LessonInkOptions<Source>) {
  const { user } = useAuth();
  const { showToast } = useToast();
  // The ink on screen: the lesson's own Draft while it's shown, and otherwise the open exercise's.
  const openId = lessonDraftId ?? openExercise?.id ?? null;

  const locate = useCallback((exerciseId: number) => {
    // A lesson's own Draft is saved under its lesson, with no PDF behind it.
    const lesson = lessonOfDraft(exerciseId);
    if (lesson !== null) return { sessionId: lesson, pdfName: null, pdfPages: [] };
    const exercise = exercises.find((ex) => ex.id === exerciseId)
      ?? (openExercise?.id === exerciseId ? openExercise : null);
    return exercise ? inkLocation(exercise) : null;
  }, [exercises, openExercise]);

  const onReplaced = useCallback((pages: ReplacedInk[]) => {
    const onScreen = pages.filter((page) => page.exerciseId === openId);
    if (onScreen.length === 0) return;
    const fromOwnTab = !!user?.email && onScreen[0].byEmail === user.email;
    showToast(replacedInkMessage(onScreen.map((page) => page.pageIndex), onScreen[0].byName, fromOwnTab), "info");
  }, [openId, user, showToast]);

  const ink = useAnnotations<Source>(storageKey, { sessionIds, locate, onReplaced });
  const {
    getAnnotations, setPageStrokes, setPagesStrokes, undo, redo, clearPage, clearAnnotations, setInkSource,
    hasAnnotations, inkReady, inkRevision, hasUnsentInk,
  } = ink;

  // The Pen Tray's tool, colours and sizes. Lessons start on the Hand, and the
  // tray is kept on it until the saved ink has loaded. The drawing layers are
  // told as well, because the compasses draw whatever tool is picked.
  const tools = useAnnotationTools({ inkReady });
  const { drawingEnabled, selectHand } = tools;
  useEffect(() => {
    if (!inkReady && drawingEnabled) selectHand();
  }, [inkReady, drawingEnabled, selectHand]);

  // The open exercise's strokes. inkRevision goes up when ink arrives from
  // the server, so they're copied again then too.
  const [annotations, setAnnotations] = useState<PageAnnotations>({});
  useEffect(() => {
    setAnnotations(openId === null ? {} : getAnnotations(openId));
  }, [openId, getAnnotations, inkRevision]);

  // The source is the open exercise's, even while the lesson's Draft is in its place.
  const openExerciseId = openExercise?.id ?? null;
  useEffect(() => {
    if (openExerciseId !== null && openSource) setInkSource(openExerciseId, openSource);
  }, [openExerciseId, openSource, setInkSource]);

  const onPageStrokesChange = useCallback((pageIndex: number, strokes: Stroke[]) => {
    if (openId === null) return;
    setAnnotations((prev) => ({ ...prev, [pageIndex]: strokes }));
    setPageStrokes(openId, pageIndex, strokes);
  }, [openId, setPageStrokes]);

  // The lasso's Move changes the page the ink leaves and the page it lands on, as one change that one undo takes back.
  const onPagesStrokesChange = useCallback((pages: PageAnnotations) => {
    if (openId === null) return;
    setAnnotations((prev) => ({ ...prev, ...pages }));
    setPagesStrokes(openId, pages);
  }, [openId, setPagesStrokes]);

  // Undo and redo follow the order the tutor drew in, across every page of the exercise.
  const onUndo = useCallback(() => {
    if (openId === null) return;
    const updated = undo(openId);
    if (updated) setAnnotations(updated);
  }, [openId, undo]);

  const onRedo = useCallback(() => {
    if (openId === null) return;
    const updated = redo(openId);
    if (updated) setAnnotations(updated);
  }, [openId, redo]);

  // Every clear can be undone, and the tray offers an Undo straight after each one.
  const onClearAll = useCallback(() => {
    if (openId === null) return;
    clearAnnotations(openId);
    setAnnotations({});
  }, [openId, clearAnnotations]);

  const onClearPage = useCallback((pageIndex: number) => {
    if (openId === null) return;
    clearPage(openId, pageIndex);
    setAnnotations((prev) => ({ ...prev, [pageIndex]: [] }));
  }, [openId, clearPage]);

  // The Draft clears one sheet or all of them, either way as one change that one undo brings back.
  const onClearPages = useCallback((pages: number[]) => {
    if (openId === null) return;
    clearAnnotations(openId, pages);
    setAnnotations(getAnnotations(openId));
  }, [openId, clearAnnotations, getAnnotations]);

  // Warn before the tab closes or reloads while some ink hasn't reached the server.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsentInk()) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsentInk]);

  return {
    ...ink,
    tools,
    /** The open exercise's strokes, page by page. */
    annotations,
    /** Whether the open exercise has any ink. */
    openHasInk: openId !== null && hasAnnotations(openId),
    /** Whether there's ink on screen to undo and redo: an exercise's, or the lesson's own Draft's. */
    inkOpen: openId !== null,
    onPageStrokesChange,
    onPagesStrokesChange,
    onUndo,
    onRedo,
    onClearAll,
    onClearPage,
    onClearPages,
  };
}
