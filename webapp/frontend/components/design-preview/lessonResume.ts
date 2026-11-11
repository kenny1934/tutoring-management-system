import type { PdfViewState } from "@/components/lesson/PdfPageViewer";
import { normaliseTimeSlot } from "@/lib/time-slots";
import { getExercisePageNumbers, getAnswerPageNumbers } from "@/lib/lesson-utils";
import type { SessionExercise } from "@/types";

export const LESSON_RESUME_STORAGE = "csm.lesson-resume.v1";
const CLASS_LIMIT = 8;
const VIEW_LIMIT = 100;
export type LessonTarget = { sessionId: number; exerciseId: number; source: string; record: boolean };
type SavedView = [number, string, PdfViewState];
type Snapshot = {
  selected: LessonTarget | null;
  last: LessonTarget[];
  mode: "by-student" | "by-file";
  worksheet: SavedView[];
  answer: SavedView[];
};
type Bucket = { scope: string; lessons: [string, Snapshot][] };

export function lessonClassKey(date: string, slot: string, tutor: number, location: string) {
  return JSON.stringify([date, normaliseTimeSlot(slot), tutor, location]);
}

export function lessonSingleKey(sessionId: number) {
  return JSON.stringify(["single", sessionId]);
}

/** Only a source fingerprint enters tab storage, along with IDs and reading choices. */
export function lessonTarget(sessionId: number, exercise: SessionExercise, record = false): LessonTarget {
  const source = JSON.stringify([exercise.pdf_name, exercise.url, getExercisePageNumbers(exercise), exercise.answer_pdf_name, getAnswerPageNumbers(exercise)]);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return { sessionId, exerciseId: exercise.id, source: String(hash >>> 0), record };
}

function bucket(): Bucket | null {
  try {
    const raw = sessionStorage.getItem(LESSON_RESUME_STORAGE);
    if (!raw || raw.length > 500_000) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.scope === "string" && Array.isArray(parsed.lessons) && parsed.lessons.length <= CLASS_LIMIT &&
      parsed.lessons.every((item: unknown) => Array.isArray(item) && item.length === 2 && typeof item[0] === "string" && item[1] && typeof item[1] === "object") ? parsed : null;
  } catch { return null; }
}
function write(value: Bucket | null) {
  try {
    if (!value) return sessionStorage.removeItem(LESSON_RESUME_STORAGE);
    let encoded = JSON.stringify(value);
    while (encoded.length > 500_000 && value.lessons.length) {
      value.lessons.shift(); encoded = JSON.stringify(value);
    }
    sessionStorage.setItem(LESSON_RESUME_STORAGE, encoded);
  } catch { /* Restricted or full storage leaves the lesson usable without resumption. */ }
}

/** A previous frame cannot repopulate the bucket after the viewer's scope changes. */
export function activateLessonResumeScope(scope: string | null) {
  if (!scope) return write(null);
  if (bucket()?.scope !== scope) write({ scope, lessons: [] });
}

function target(value: unknown): value is LessonTarget {
  if (!value || typeof value !== "object") return false;
  const t = value as LessonTarget;
  return Number.isSafeInteger(t.sessionId) && Number.isSafeInteger(t.exerciseId) && typeof t.source === "string" && t.source.length < 32 && typeof t.record === "boolean";
}
function reading(value: unknown): value is PdfViewState {
  if (!value || typeof value !== "object") return false;
  const v = value as PdfViewState;
  return Number.isFinite(v.zoom) && v.zoom > 0 && v.zoom <= 200 &&
    Number.isFinite(v.scrollTop) && v.scrollTop >= 0 && Number.isFinite(v.scrollLeft) && v.scrollLeft >= 0 &&
    typeof v.userZoomed === "boolean" && typeof v.inkHidden === "boolean" && !!v.covers && typeof v.covers === "object" &&
    Object.entries(v.covers).length <= 100 && Object.entries(v.covers).every(([page, top]) => /^\d+$/.test(page) && Number.isFinite(top) && top >= 0 && top <= 1);
}
function savedViews(value: unknown): SavedView[] {
  return Array.isArray(value) ? value.slice(-VIEW_LIMIT).filter(v => Array.isArray(v) && v.length === 3 && Number.isSafeInteger(v[0]) && typeof v[1] === "string" && reading(v[2])) : [];
}
function snapshot(value?: Partial<Snapshot>): Snapshot {
  return {
    selected: target(value?.selected) ? value.selected : null,
    last: Array.isArray(value?.last) ? value.last.filter(target).slice(-VIEW_LIMIT) : [],
    mode: value?.mode === "by-file" ? "by-file" : "by-student",
    worksheet: savedViews(value?.worksheet), answer: savedViews(value?.answer),
  };
}

export class LessonResumeMemory {
  constructor(readonly scope: string) {}
  load(key: string) {
    const current = bucket();
    return snapshot(current?.scope === this.scope ? current.lessons.find(item => Array.isArray(item) && item[0] === key)?.[1] : undefined);
  }
  save(key: string, value: Snapshot) {
    const current = bucket();
    if (current?.scope !== this.scope) return;
    write({ scope: this.scope, lessons: [...current.lessons.filter(item => item[0] !== key), [key, value] as [string, Snapshot]].slice(-CLASS_LIMIT) });
  }
}

/** These maps belong to the lesson, so recreating the viewer never discards a saved place. */
export class LessonResumeEntry {
  readonly worksheet = new Map<number, PdfViewState>();
  readonly answer = new Map<number, PdfViewState>();
  readonly last = new Map<number, LessonTarget>();
  selected: LessonTarget | null;
  mode: Snapshot["mode"];
  private sources = new Map<number, string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;

  constructor(private memory: LessonResumeMemory | null, private key: string) {
    const saved = memory?.load(key) ?? snapshot();
    this.selected = saved.selected; this.mode = saved.mode;
    for (const t of saved.last) this.last.set(t.sessionId, t);
    for (const [id, source, view] of saved.worksheet) { this.sources.set(id, source); this.worksheet.set(id, view); }
    for (const [id, source, view] of saved.answer) { this.sources.set(id, source); this.answer.set(id, view); }
  }
  reconcile(targets: LessonTarget[]) {
    const sources = new Map(targets.map(t => [t.exerciseId, t.source]));
    for (const id of new Set([...this.worksheet.keys(), ...this.answer.keys()])) {
      if (this.sources.get(id) !== sources.get(id) || !sources.has(id)) { this.worksheet.delete(id); this.answer.delete(id); }
    }
    this.sources = sources;
  }
  initial(targets: LessonTarget[], requestedSession?: number) {
    const desired = requestedSession === undefined ? this.selected : this.last.get(requestedSession);
    const sessionId = requestedSession ?? desired?.sessionId;
    return targets.find(t => t.exerciseId === desired?.exerciseId && t.sessionId === sessionId && t.record === desired?.record)
      ?? targets.find(t => t.sessionId === sessionId);
  }
  remember(selected: LessonTarget, mode: Snapshot["mode"]) {
    this.selected = selected; this.mode = mode;
    if (!selected.record) this.last.set(selected.sessionId, selected);
    this.changed();
  }
  readonly capture = (exerciseId: number, source: string) => {
    // A roster refresh may arrive while the old worksheet is still mounted.
    // Its late scroll events cannot label an old view as the replacement PDF.
    if (this.sources.get(exerciseId) !== source) {
      this.worksheet.delete(exerciseId); this.answer.delete(exerciseId);
      return;
    }
    this.changed();
  };
  readonly changed = () => {
    if (!this.memory) return;
    this.dirty = true;
    if (this.timer === undefined) this.timer = setTimeout(this.flush, 250);
  };
  readonly flush = () => {
    clearTimeout(this.timer); this.timer = undefined;
    if (!this.dirty || !this.memory) return;
    this.dirty = false;
    const views = (map: Map<number, PdfViewState>): SavedView[] => [...map].slice(-VIEW_LIMIT)
      .filter(([id, view]) => this.sources.has(id) && reading(view))
      .map(([id, view]) => [id, this.sources.get(id)!, view]);
    this.memory.save(this.key, { selected: this.selected, last: [...this.last.values()].slice(-VIEW_LIMIT), mode: this.mode, worksheet: views(this.worksheet), answer: views(this.answer) });
  };
}
