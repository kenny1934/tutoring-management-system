"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { lessonInkAPI, type LessonInkPage, type LessonInkPageIn } from "@/lib/api";

/** A single freehand stroke on a page. */
export interface Stroke {
  /** Input points: [x, y, pressure] in page-coordinate space (0..pageWidth, 0..pageHeight). */
  points: [number, number, number][];
  color: string;
  size: number;
  /**
   * "highlighter" for highlighter ink, which is see-through and sits under
   * pen ink. Pen strokes leave it out, and so does every stroke saved before
   * the highlighter existed, so old ink still loads as pen.
   */
  kind?: "highlighter";
}

// How opaque each kind of ink is, on screen and in the saved PDF alike.
const PEN_OPACITY = 0.85;
const HIGHLIGHTER_OPACITY = 0.35;

export const strokeOpacity = (stroke: Pick<Stroke, "kind">) =>
  stroke.kind === "highlighter" ? HIGHLIGHTER_OPACITY : PEN_OPACITY;

export type InkKind = "pen" | "highlighter";

/** A new stroke in the given ink. Pen strokes carry no kind, like ink saved before the highlighter. */
export function makeStroke(points: Stroke["points"], color: string, size: number, ink: InkKind): Stroke {
  return ink === "highlighter" ? { points, color, size, kind: "highlighter" } : { points, color, size };
}

/**
 * A page's strokes split into the two layers they're painted in: highlighter
 * ink first, then pen ink on top of it, each keeping the order it was drawn
 * in. The screen and the saved PDF both paint in this order.
 */
export function inkLayers(strokes: Stroke[]): [highlighter: Stroke[], pen: Stroke[]] {
  const highlighter: Stroke[] = [];
  const pen: Stroke[] = [];
  for (const s of strokes) (s.kind === "highlighter" ? highlighter : pen).push(s);
  return [highlighter, pen];
}

/** Strokes keyed by page index (0-based within the displayed pages). */
export interface PageAnnotations {
  [pageIndex: number]: Stroke[];
}

/**
 * The Draft is blank or squared paper beside the worksheet, for the tutor's
 * working. Its ink lives in the exercise's own annotations as extra pages,
 * starting at this page index, so sheet one is page 1000. No worksheet shows
 * anywhere near a thousand pages, so the two never collide. That also means
 * undo, clearing, the exit warnings and saving all treat Draft ink like any
 * other ink without knowing the Draft exists. It's defined here, not in
 * lib/draft-sheets, because that file imports from this one when it loads.
 */
export const DRAFT_PAGE_BASE = 1000;

/** Whether an exercise's annotations hold at least one stroke. */
export function hasInk(annotations: PageAnnotations | undefined): annotations is PageAnnotations {
  return !!annotations && Object.values(annotations).some((strokes) => strokes.length > 0);
}

/**
 * Scale factor for rendering crisp PDF pages.
 * Shared between PdfPageViewer (render) and pdf-annotation-save (export).
 * Annotation coordinates are in CSS pixel space = pdfPoints * RENDER_SCALE.
 */
export const RENDER_SCALE = 1.5;

/** Shared perfect-freehand options for consistent stroke rendering. */
export function getStrokeOptions(stroke: Stroke, isComplete: boolean) {
  // A stroke with exactly two points is a straight line. It comes from the
  // Straight lines tool, or it's a short piece the eraser cut from a longer
  // stroke. Either way it's drawn the same width all the way along. Streamline
  // is off, because it would pull the far end back towards the start while
  // the line is still being dragged.
  if (stroke.points.length === 2) {
    return {
      size: stroke.size,
      thinning: 0,
      smoothing: 0.5,
      streamline: 0,
      simulatePressure: false,
      start: { cap: true, taper: 0 },
      end: { cap: true, taper: 0 },
      last: isComplete,
    };
  }
  // A highlighter keeps the same width all the way along, like a felt tip, so
  // it ignores pressure and doesn't thin out when you move fast.
  if (stroke.kind === "highlighter") {
    return {
      size: stroke.size,
      thinning: 0,
      smoothing: 0.6,
      streamline: 0.6,
      simulatePressure: false,
      start: { cap: true, taper: 0 },
      end: { cap: true, taper: 0 },
      last: isComplete,
    };
  }
  return {
    size: stroke.size,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: stroke.points.every(([, , p]) => p === 0.5),
    start: { cap: true, taper: 0 },
    end: { cap: true, taper: 0 },
    last: isComplete,
  };
}

/**
 * One step in an exercise's undo or redo history. It records what each page it
 * touched held on the other side of the change, so stepping back or forward
 * just puts those strokes back. Drawing a stroke, erasing one and clearing a
 * page each touch one page. Clearing the whole exercise touches every page
 * that had ink, and it's still one step, so one undo brings all of it back.
 */
interface HistoryEntry {
  pages: PageAnnotations;
}

/** True when both lists hold the same stroke objects in the same order. */
function sameStrokes(a: Stroke[], b: Stroke[]): boolean {
  return a.length === b.length && a.every((stroke, i) => stroke === b[i]);
}

/**
 * Strokes restored from sessionStorage come back without any history, so we
 * rebuild one as if they had been drawn a page at a time, in page order. That
 * keeps undo working after a reload, even though the real order is lost.
 */
function historyFromStrokes(annotations: PageAnnotations): HistoryEntry[] {
  const history: HistoryEntry[] = [];
  const pages = Object.keys(annotations).map(Number).sort((a, b) => a - b);
  for (const pageIndex of pages) {
    const strokes = annotations[pageIndex] || [];
    for (let i = 0; i < strokes.length; i++) {
      history.push({ pages: { [pageIndex]: strokes.slice(0, i) } });
    }
  }
  return history;
}

/**
 * Pull the most recent entry off a history stack. When a page is given, only
 * entries that touched that page count, which is how Zen mode undoes on the
 * page you are looking at. Taking an entry out of the middle is safe, because
 * we only ever take that page's part of it. When the entry touched other pages
 * too, as clearing the whole exercise does, the rest of it stays where it was
 * in the stack for those pages.
 */
function takeLatest(stack: HistoryEntry[], pageIndex?: number): HistoryEntry | null {
  if (pageIndex === undefined) return stack.pop() ?? null;
  for (let i = stack.length - 1; i >= 0; i--) {
    const pages = stack[i].pages;
    if (!(pageIndex in pages)) continue;
    const { [pageIndex]: strokes, ...rest } = pages;
    if (Object.keys(rest).length === 0) stack.splice(i, 1);
    else stack[i] = { pages: rest };
    return { pages: { [pageIndex]: strokes } };
  }
  return null;
}

/** Where an exercise's ink is saved on the server. */
export interface InkLocation {
  /** The lesson it belongs to. A preview goes under the lesson the view files it with. */
  sessionId: number;
  pdfName?: string | null;
  /** The PDF pages the exercise shows, in order, or an empty list when it shows the whole PDF. */
  pdfPages: number[];
}

/** A page this view had that another tab or person has since saved. */
export interface ReplacedInk {
  exerciseId: number;
  pageIndex: number;
  byName: string | null;
  /** Whoever saved it, so a view can tell another tab of its own from someone else. */
  byEmail: string;
}

/**
 * Turns on saving to the server. The one-student view passes its lesson and
 * the one before it, and the multi-student view passes every lesson in the slot.
 */
export interface InkServerOptions {
  sessionIds: number[];
  /** Where an exercise's ink goes, or null when the view can't place the exercise. */
  locate: (exerciseId: number) => InkLocation | null;
  /** Told about pages another tab or person changed, so the view can say so. */
  onReplaced?: (pages: ReplacedInk[]) => void;
}

/**
 * Where the view's ink stands with the server. "loading" lasts until the
 * lessons' ink has arrived. "waiting" means some pages haven't been sent yet,
 * either because they're about to go or because the last try failed, and
 * "offline" is the same thing while the browser says it has no connection.
 */
export type InkSyncStatus = "loading" | "saved" | "saving" | "waiting" | "offline";

// How long after the last change a page is sent, and the longest wait between tries.
const SEND_AFTER_MS = 2000;
const MAX_RETRY_MS = 60_000;
// The server takes at most this many pages in one save.
const PAGES_PER_SEND = 50;

/**
 * The server's key for a page. A worksheet page is saved under its page of the
 * PDF, counted from 0, so it stays on its page if someone edits the exercise's
 * page range. A Draft sheet keeps its own index. It's null for a page the
 * exercise doesn't show.
 */
export function serverPageIndex(pageIndex: number, pdfPages: number[]): number | null {
  if (pageIndex >= DRAFT_PAGE_BASE || pdfPages.length === 0) return pageIndex;
  const pdfPage = pdfPages[pageIndex];
  return pdfPage ? pdfPage - 1 : null;
}

/** Where a page saved under a server key shows among the exercise's pages, or null when it isn't shown. */
export function viewPageIndex(serverIndex: number, pdfPages: number[]): number | null {
  if (serverIndex >= DRAFT_PAGE_BASE || pdfPages.length === 0) return serverIndex;
  const index = pdfPages.indexOf(serverIndex + 1);
  return index === -1 ? null : index;
}

/**
 * A lesson's own Draft, the one a tutor can open before the lesson has any
 * courseware, is kept in the ink store like an exercise's ink, under an id of
 * its own. Exercises have positive ids, and a preview has its file's id made
 * negative. The server keeps a target's number to ten digits, so no file id
 * reaches this offset, and a lesson's Draft id is always past every preview's.
 */
const LESSON_DRAFT_OFFSET = 10_000_000_000;

/** The ink store's id for a lesson's own Draft. */
export const lessonDraftId = (sessionId: number) => -(LESSON_DRAFT_OFFSET + sessionId);

/** The lesson whose own Draft this ink store id is, or null when it's an exercise or a preview. */
export const lessonOfDraft = (id: number): number | null =>
  id <= -LESSON_DRAFT_OFFSET ? -id - LESSON_DRAFT_OFFSET : null;

/**
 * An exercise's key on the server. A preview has a negative id, and is saved
 * by its file. A lesson's own Draft is saved by its lesson.
 */
export const inkTargetKey = (exerciseId: number) => {
  const lesson = lessonOfDraft(exerciseId);
  if (lesson !== null) return `draft:${lesson}`;
  return exerciseId < 0 ? `preview:${-exerciseId}` : `ex:${exerciseId}`;
};

function exerciseIdFromTarget(targetKey: string): number | null {
  const [kind, value] = targetKey.split(":");
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (kind === "draft") return lessonDraftId(id);
  return kind === "ex" ? id : kind === "preview" ? -id : null;
}

const roundTo = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/**
 * A stroke as it's saved. x and y are rounded to a tenth of a page unit, which
 * is far below anything anyone can see, and pressure to two places. That cuts
 * a heavy page to about a third of its size. A pressure of exactly 0.5 means
 * "simulate the pressure", and rounding keeps it exactly 0.5.
 */
export function roundStroke(stroke: Stroke): Stroke {
  return {
    ...stroke,
    points: stroke.points.map(([x, y, p]) => [roundTo(x, 1), roundTo(y, 1), roundTo(p, 2)]),
  };
}

const pageKey = (exerciseId: number, pageIndex: number) => `${exerciseId}:${pageIndex}`;

const connectionStatus = (): InkSyncStatus =>
  typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "waiting";

/**
 * In-memory annotation state manager for lesson mode.
 * Annotations are keyed by exercise ID and survive exercise switches.
 * All state is GC'd when the host component unmounts.
 *
 * Each exercise keeps its own undo history in the order you made the changes,
 * across all of its pages, so undo takes back whatever you did last, whether
 * that was drawing a stroke, erasing one, clearing a page or clearing the
 * whole exercise.
 *
 * When sessionKey is provided, annotations are auto-saved to sessionStorage
 * (debounced 500ms) and restored on mount. The history itself is not saved.
 *
 * Given server options as well, the hook saves ink to the server. It fetches
 * the lessons' ink on mount, and again whenever the tab comes back into view,
 * and it sends the pages that changed about two seconds after the last change.
 * sessionStorage then holds only the pages that haven't been sent, so a reload
 * still sends them. The Zen views pass no server options, and nothing of
 * theirs is sent anywhere.
 *
 * Each exercise can also have a source: whatever the view wants to remember
 * about what its ink was drawn on, such as how to save it. Sources are saved
 * next to the ink under their own key and cleared along with it.
 */
export function useAnnotations<Source = unknown>(sessionKey?: string, server?: InkServerOptions) {
  const storeRef = useRef<Map<number, PageAnnotations>>(new Map());
  const sourcesRef = useRef<Map<number, Source>>(new Map());
  const sourcesKey = sessionKey && `${sessionKey}:sources`;
  // Undo and redo stacks per exercise, newest entry last.
  const undoRef = useRef<Map<number, HistoryEntry[]>>(new Map());
  const redoRef = useRef<Map<number, HistoryEntry[]>>(new Map());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // --- Saving to the server ---
  // Pages are tracked the way the views count them, by exercise and page
  // index, and only turned into the server's keys as they're sent.
  const serverOn = !!server;
  const sessionIdsKey = server
    ? [...new Set(server.sessionIds)].sort((a, b) => a - b).join(",")
    : "";
  const serverRef = useRef(server);
  useEffect(() => {
    serverRef.current = server;
  });
  // Pages changed since they were last sent. Every change gets a new number,
  // so a page changed again while it was being sent stays on the list.
  const unsentRef = useRef<Map<string, { exerciseId: number; pageIndex: number; change: number }>>(new Map());
  const changeCountRef = useRef(0);
  // The version of each page that this view last read or wrote.
  const versionsRef = useRef<Map<string, number>>(new Map());
  // Where each exercise's loaded ink came from. It sends the ink back there
  // when the view can't place the exercise, as with a preview after a reload.
  const homesRef = useRef<Map<number, InkLocation>>(new Map());
  const loadedRef = useRef(false);
  // The save on its way to the server, if there is one.
  const sendingRef = useRef<Promise<void> | null>(null);
  const retryMsRef = useRef(0);
  const sendTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sendRef = useRef<() => Promise<void>>(async () => {});
  const [syncStatus, setSyncStatus] = useState<InkSyncStatus>(serverOn ? "loading" : "saved");
  const [inkReady, setInkReady] = useState(!serverOn);
  // Goes up whenever ink arrives from the server. The views copy the open
  // exercise's ink into their own state, so they watch this to copy it again.
  const [inkRevision, setInkRevision] = useState(0);

  const markUnsent = useCallback((exerciseId: number, pageIndex: number) => {
    unsentRef.current.set(pageKey(exerciseId, pageIndex), {
      exerciseId, pageIndex, change: ++changeCountRef.current,
    });
  }, []);

  // The pages the server hasn't got yet, with rounded points, for sessionStorage.
  const unsentInk = useCallback(() => {
    const ink: Record<number, PageAnnotations> = {};
    for (const { exerciseId, pageIndex } of unsentRef.current.values()) {
      const strokes = storeRef.current.get(exerciseId)?.[pageIndex] ?? [];
      (ink[exerciseId] ??= {})[pageIndex] = strokes.map(roundStroke);
    }
    return ink;
  }, []);

  // Debounced persist to sessionStorage. With the server on, only the pages
  // it hasn't got are kept there, which stays well inside the 5 MB that
  // sessionStorage allows.
  const persistToStorage = useCallback(() => {
    if (!sessionKey) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        const ink = serverOn ? unsentInk() : Object.fromEntries(storeRef.current);
        sessionStorage.setItem(sessionKey, JSON.stringify(ink));
      } catch {}
    }, 500);
  }, [sessionKey, serverOn, unsentInk]);

  const persistSources = useCallback(() => {
    if (!sourcesKey) return;
    try { sessionStorage.setItem(sourcesKey, JSON.stringify([...sourcesRef.current])); } catch {}
  }, [sourcesKey]);

  const scheduleSend = useCallback((delay: number) => {
    if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
    sendTimerRef.current = setTimeout(() => void sendRef.current(), delay);
  }, []);

  /** Pages changed: keep them in the tab and, with the server on, send them shortly. */
  const changed = useCallback((exerciseId: number, pages: number[]) => {
    if (serverOn) {
      for (const pageIndex of pages) markUnsent(exerciseId, pageIndex);
      // Until the lessons' ink has loaded, the pages wait, and the load sends them.
      if (loadedRef.current) {
        setSyncStatus("waiting");
        scheduleSend(SEND_AFTER_MS);
      }
    }
    persistToStorage();
  }, [serverOn, markUnsent, persistToStorage, scheduleSend]);

  /** The unsent pages as the server wants them, at most one save's worth, and how to match the reply back to them. */
  const buildBatch = useCallback(() => {
    const locate = serverRef.current?.locate;
    const pages: LessonInkPageIn[] = [];
    const sent = new Map<string, { key: string; change: number }>();
    for (const [key, page] of unsentRef.current) {
      if (pages.length === PAGES_PER_SEND) break;
      const home = locate?.(page.exerciseId) ?? homesRef.current.get(page.exerciseId);
      if (!home) continue;
      const index = serverPageIndex(page.pageIndex, home.pdfPages);
      const target = inkTargetKey(page.exerciseId);
      const serverKey = `${home.sessionId}|${target}|${index}`;
      // A page the exercise doesn't show can't be saved. A range that lists a
      // page twice shows it twice, and the server keeps one copy of it.
      if (index === null || sent.has(serverKey)) {
        unsentRef.current.delete(key);
        continue;
      }
      pages.push({
        session_id: home.sessionId,
        target_key: target,
        page_index: index,
        pdf_page: index >= DRAFT_PAGE_BASE ? null : index + 1,
        pdf_name: home.pdfName ?? null,
        strokes: (storeRef.current.get(page.exerciseId)?.[page.pageIndex] ?? []).map(roundStroke),
      });
      sent.set(serverKey, { key, change: page.change });
    }
    return { pages, sent };
  }, []);

  const send = useCallback(async () => {
    if (!loadedRef.current || sendingRef.current || unsentRef.current.size === 0) return;
    const { pages, sent } = buildBatch();
    if (pages.length > 0) {
      setSyncStatus("saving");
      const saving = lessonInkAPI.save(pages);
      sendingRef.current = saving.then(() => {}, () => {});
      try {
        const result = await saving;
        const settle = (page: { session_id: number; target_key: string; page_index: number }, version?: number) => {
          const entry = sent.get(`${page.session_id}|${page.target_key}|${page.page_index}`);
          if (!entry) return;
          if (version !== undefined) versionsRef.current.set(entry.key, version);
          if (unsentRef.current.get(entry.key)?.change === entry.change) unsentRef.current.delete(entry.key);
        };
        for (const page of result.saved) settle(page, page.version);
        // The server drops a page whose exercise has left the lesson. That
        // exercise's ink went with it, so there's nothing left to send.
        for (const page of result.dropped) settle(page);
        retryMsRef.current = 0;
        persistToStorage();
      } catch {
        retryMsRef.current = Math.min(Math.max(SEND_AFTER_MS, retryMsRef.current * 2), MAX_RETRY_MS);
      } finally {
        sendingRef.current = null;
      }
    }
    if (unsentRef.current.size === 0) {
      setSyncStatus("saved");
    } else {
      setSyncStatus(connectionStatus());
      scheduleSend(retryMsRef.current || SEND_AFTER_MS);
    }
  }, [buildBatch, persistToStorage, scheduleSend]);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  /**
   * One last try with the pages that haven't been sent, for when the view is
   * going away: the tab closing, or the view unmounting within the app, which
   * doesn't fire pagehide.
   */
  const sendOnExit = useCallback(() => {
    if (loadedRef.current && unsentRef.current.size > 0) lessonInkAPI.saveOnExit(buildBatch().pages);
  }, [buildBatch]);

  /**
   * Take in pages from the server. A page this view still has to send keeps
   * its own strokes, because it's the later save and will win. Any other page
   * the server has a newer version of is replaced, and when the view already
   * had that page, it's reported as changed elsewhere. Each exercise that
   * takes in a page gets its undo history rebuilt, as after a reload.
   */
  const takeServerPages = useCallback((pages: LessonInkPage[]) => {
    const locate = serverRef.current?.locate;
    const replaced: ReplacedInk[] = [];
    const touched = new Set<number>();
    for (const page of pages) {
      const exerciseId = exerciseIdFromTarget(page.target_key);
      if (exerciseId === null) continue;
      // A preview the view no longer lists still shows its whole PDF.
      const home = locate?.(exerciseId)
        ?? (exerciseId < 0 ? { sessionId: page.session_id, pdfName: page.pdf_name, pdfPages: [] } : null);
      if (!home) continue;
      homesRef.current.set(exerciseId, home);
      const pageIndex = viewPageIndex(page.page_index, home.pdfPages);
      if (pageIndex === null) continue;
      const key = pageKey(exerciseId, pageIndex);
      const known = versionsRef.current.get(key);
      if (unsentRef.current.has(key) || (known !== undefined && page.version <= known)) continue;
      versionsRef.current.set(key, page.version);
      storeRef.current.set(exerciseId, { ...storeRef.current.get(exerciseId), [pageIndex]: page.strokes });
      touched.add(exerciseId);
      if (known !== undefined) {
        replaced.push({ exerciseId, pageIndex, byName: page.updated_by_name, byEmail: page.updated_by });
      }
    }
    for (const exerciseId of touched) {
      undoRef.current.set(exerciseId, historyFromStrokes(storeRef.current.get(exerciseId) ?? {}));
      redoRef.current.delete(exerciseId);
    }
    if (touched.size > 0) setInkRevision((n) => n + 1);
    if (replaced.length > 0) serverRef.current?.onReplaced?.(replaced);
  }, []);

  // Restore from sessionStorage on mount
  useEffect(() => {
    if (!sessionKey || !sourcesKey) return;
    try {
      const saved = sessionStorage.getItem(sourcesKey);
      // A source the view has already set since mounting is newer than the saved one.
      if (saved) sourcesRef.current = new Map([...JSON.parse(saved), ...sourcesRef.current]);
    } catch {}
    try {
      const saved = sessionStorage.getItem(sessionKey);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      const map = new Map<number, PageAnnotations>();
      const history = new Map<number, HistoryEntry[]>();
      for (const [k, v] of Object.entries(parsed)) {
        const id = Number(k);
        if (!isNaN(id) && typeof v === "object" && v !== null) {
          map.set(id, v as PageAnnotations);
          history.set(id, historyFromStrokes(v as PageAnnotations));
          // With the server on, the tab only kept the pages it hadn't sent.
          if (serverOn) for (const page of Object.keys(v)) markUnsent(id, Number(page));
        }
      }
      storeRef.current = map;
      undoRef.current = history;
      redoRef.current = new Map();
    } catch {}
  }, [sessionKey, sourcesKey, serverOn, markUnsent]);

  // Load the lessons' ink, and fetch it again whenever the tab comes back.
  useEffect(() => {
    if (!sessionIdsKey) return;
    const ids = sessionIdsKey.split(",").map(Number);
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryMs = SEND_AFTER_MS;

    const load = async () => {
      try {
        const { pages } = await lessonInkAPI.read(ids);
        if (cancelled) return;
        takeServerPages(pages);
        if (!loadedRef.current) {
          loadedRef.current = true;
          setInkReady(true);
          setSyncStatus(unsentRef.current.size > 0 ? "waiting" : "saved");
          if (unsentRef.current.size > 0) scheduleSend(SEND_AFTER_MS);
        }
      } catch {
        if (cancelled || loadedRef.current) return;
        // Nothing can be sent until the lessons' ink has arrived, or a page
        // sent now could replace strokes this view has never seen.
        if (connectionStatus() === "offline") setSyncStatus("offline");
        retryTimer = setTimeout(load, retryMs);
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
      }
    };
    void load();

    const onVisibility = () => {
      if (document.visibilityState === "hidden") scheduleSend(0);
      else if (loadedRef.current) void load();
    };
    const onOnline = () => scheduleSend(0);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", sendOnExit);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", sendOnExit);
    };
  }, [sessionIdsKey, takeServerPages, scheduleSend, sendOnExit]);

  // Clear the timers on unmount, and give the unsent pages their last try.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
      sendOnExit();
    };
  }, [sendOnExit]);

  const getAnnotations = useCallback((exerciseId: number): PageAnnotations => {
    return storeRef.current.get(exerciseId) || {};
  }, []);

  /**
   * Remember what an exercise's ink is drawn on. The lesson views record how
   * to save each exercise they open, so "Download All" can still save its ink
   * after the exercise has left the lesson's list, as a preview has after a
   * reload.
   */
  const setInkSource = useCallback((exerciseId: number, source: Source) => {
    sourcesRef.current.set(exerciseId, source);
    persistSources();
  }, [persistSources]);

  const getInkSource = useCallback((exerciseId: number): Source | undefined => {
    return sourcesRef.current.get(exerciseId);
  }, []);

  /**
   * Replace several pages' strokes as one change you made, so one undo puts
   * them all back. The lasso's Move needs more than one page, because moving
   * ink changes both the page it leaves and the page it lands on. A page that
   * comes back unchanged is left out, so a caller that reports extra pages
   * can't put empty steps into the history, and nothing is recorded when none
   * has changed. Any real change also throws away the redo stack, the same as
   * in any drawing app.
   */
  const setPagesStrokes = useCallback(
    (exerciseId: number, pages: PageAnnotations) => {
      const current = storeRef.current.get(exerciseId) || {};
      const before: PageAnnotations = {};
      for (const [page, strokes] of Object.entries(pages)) {
        const was = current[Number(page)] || [];
        if (!sameStrokes(was, strokes)) before[Number(page)] = was;
      }
      const touched = Object.keys(before).map(Number);
      if (touched.length === 0) return;

      const after = { ...current };
      for (const page of touched) after[page] = pages[page];
      storeRef.current.set(exerciseId, after);
      const undo = undoRef.current.get(exerciseId) || [];
      undo.push({ pages: before });
      undoRef.current.set(exerciseId, undo);
      redoRef.current.delete(exerciseId);
      changed(exerciseId, touched);
    },
    [changed]
  );

  /** Replace one page's strokes as a new change you made. The viewers report each page as it changes. */
  const setPageStrokes = useCallback(
    (exerciseId: number, pageIndex: number, strokes: Stroke[]) => setPagesStrokes(exerciseId, { [pageIndex]: strokes }),
    [setPagesStrokes]
  );

  /**
   * Move one history entry from one stack to the other: put its strokes back
   * on its pages, and remember what those pages held just before so the
   * opposite action can reverse it. Returns the exercise's annotations
   * afterwards, or null when there was nothing to step through.
   */
  const stepHistory = useCallback(
    (
      from: Map<number, HistoryEntry[]>,
      to: Map<number, HistoryEntry[]>,
      exerciseId: number,
      pageIndex?: number
    ): PageAnnotations | null => {
      const stack = from.get(exerciseId);
      const entry = stack ? takeLatest(stack, pageIndex) : null;
      if (!entry) return null;

      const current = storeRef.current.get(exerciseId) || {};
      const reverse: PageAnnotations = {};
      const pages = Object.keys(entry.pages).map(Number);
      for (const page of pages) reverse[page] = current[page] || [];
      const opposite = to.get(exerciseId) || [];
      opposite.push({ pages: reverse });
      to.set(exerciseId, opposite);

      const updated = { ...current, ...entry.pages };
      storeRef.current.set(exerciseId, updated);
      changed(exerciseId, pages);
      return updated;
    },
    [changed]
  );

  /**
   * Undo the most recent change on an exercise, on whichever page it was.
   * Pass a page index to undo only the most recent change on that page.
   */
  const undo = useCallback(
    (exerciseId: number, pageIndex?: number) =>
      stepHistory(undoRef.current, redoRef.current, exerciseId, pageIndex),
    [stepHistory]
  );

  /** Redo the most recently undone change, optionally limited to one page. */
  const redo = useCallback(
    (exerciseId: number, pageIndex?: number) =>
      stepHistory(redoRef.current, undoRef.current, exerciseId, pageIndex),
    [stepHistory]
  );

  /** Clearing a single page is recorded like any other change, so it can be undone. */
  const clearPage = useCallback(
    (exerciseId: number, pageIndex: number) => {
      setPageStrokes(exerciseId, pageIndex, []);
    },
    [setPageStrokes]
  );

  /**
   * Clear an exercise's pages as a single change, so one undo brings all of
   * their ink back. It clears every page unless it's given the ones to clear,
   * which is how the Draft clears only its own sheets. Nothing is recorded
   * when there's no ink to clear.
   */
  const clearAnnotations = useCallback((exerciseId: number, pages?: number[]) => {
    const current = storeRef.current.get(exerciseId) || {};
    const before: PageAnnotations = {};
    for (const page of pages ?? Object.keys(current).map(Number)) {
      if (current[page]?.length) before[page] = current[page];
    }
    if (Object.keys(before).length === 0) return;

    const after: PageAnnotations = { ...current };
    for (const page of Object.keys(before)) delete after[Number(page)];
    storeRef.current.set(exerciseId, pages ? after : {});
    const undo = undoRef.current.get(exerciseId) || [];
    undo.push({ pages: before });
    undoRef.current.set(exerciseId, undo);
    redoRef.current.delete(exerciseId);
    changed(exerciseId, Object.keys(before).map(Number));
  }, [changed]);

  /** Forget all of this tab's ink. With the server on, the ink on the server is left alone. */
  const clearAll = useCallback(() => {
    storeRef.current.clear();
    undoRef.current.clear();
    redoRef.current.clear();
    sourcesRef.current.clear();
    unsentRef.current.clear();
    persistToStorage();
    persistSources();
  }, [persistToStorage, persistSources]);

  /** Remove the ink and its sources from sessionStorage entirely. */
  const clearStorage = useCallback(() => {
    if (!sessionKey || !sourcesKey) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    try {
      sessionStorage.removeItem(sessionKey);
      sessionStorage.removeItem(sourcesKey);
    } catch {}
  }, [sessionKey, sourcesKey]);

  const hasAnnotations = useCallback((exerciseId: number): boolean => {
    return hasInk(storeRef.current.get(exerciseId));
  }, []);

  /** Check if ANY exercise in the store has annotation strokes. */
  const hasAnyAnnotations = useCallback((): boolean => {
    for (const pageAnnotations of storeRef.current.values()) {
      if (hasInk(pageAnnotations)) return true;
    }
    return false;
  }, []);

  /** Return all annotations as a Map (exerciseId → PageAnnotations). */
  const getAllAnnotations = useCallback((): Map<number, PageAnnotations> => {
    return new Map(storeRef.current);
  }, []);

  /** Whether some pages haven't reached the server yet. Always false with the server off. */
  const hasUnsentInk = useCallback(() => unsentRef.current.size > 0, []);

  /**
   * Send whatever hasn't reached the server yet, straight away. It resolves
   * to true once everything has, which is when a view can close without
   * warning anyone. With the server off, there's nothing to send.
   */
  const flushInk = useCallback(async (): Promise<boolean> => {
    for (let attempt = 0; attempt < 3 && unsentRef.current.size > 0; attempt++) {
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
      // A save already on its way is waited for, and then whatever it didn't carry is sent.
      while (sendingRef.current) await sendingRef.current;
      await sendRef.current();
    }
    return unsentRef.current.size === 0;
  }, []);

  return {
    getAnnotations,
    getAllAnnotations,
    setInkSource,
    getInkSource,
    setPageStrokes,
    setPagesStrokes,
    undo,
    redo,
    clearPage,
    clearAnnotations,
    clearAll,
    clearStorage,
    hasAnnotations,
    hasAnyAnnotations,
    syncStatus,
    inkReady,
    inkRevision,
    hasUnsentInk,
    flushInk,
  };
}
