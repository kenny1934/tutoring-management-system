import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionExercise } from "@/types";
import type { PdfViewState } from "@/components/lesson/PdfPageViewer";
import { activateLessonResumeScope, lessonClassKey, lessonTarget, LessonResumeEntry, LessonResumeMemory, LESSON_RESUME_STORAGE } from "./lessonResume";

const file = (id: number, name = "A.pdf", start = 1) => ({ id, pdf_name: name, page_start: start, page_end: 3 } as SessionExercise);
const a = lessonTarget(10, file(1)), b = lessonTarget(10, file(2, "B.pdf")), c = lessonTarget(11, file(3));
const targets = [a, b, c];
const view: PdfViewState = { zoom: 125, userZoomed: true, scrollTop: 410, scrollLeft: 60, inkHidden: false, covers: { 0: .4 } };
let memory: LessonResumeMemory;
beforeEach(() => { vi.useFakeTimers(); sessionStorage.clear(); activateLessonResumeScope("viewer"); memory = new LessonResumeMemory("viewer"); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const open = (key = "class") => { const entry = new LessonResumeEntry(memory, key); entry.reconcile(targets); return entry; };

describe("tab-scoped lesson resumption", () => {
  it("recreates the selected worksheet and independent reading maps without keeping API objects or PDF bytes", () => {
    const entry = open(); entry.remember(b, "by-file"); entry.worksheet.set(2, view); entry.answer.set(2, { ...view, zoom: 75 }); entry.changed(); entry.flush();
    const restored = open();
    expect(restored.initial(targets)).toEqual(b);
    expect(restored.mode).toBe("by-file");
    expect(restored.worksheet.get(2)).toEqual(view);
    expect(restored.answer.get(2)?.zoom).toBe(75);
    expect(sessionStorage.getItem(LESSON_RESUME_STORAGE)).not.toMatch(/\.pdf|student_name|pdfData|annotations/);
  });
  it("honours a requested student and remembers each student's last worksheet", () => {
    const entry = open(); entry.remember(b, "by-student"); entry.remember(c, "by-student"); entry.flush();
    const restored = open();
    expect(restored.initial(targets)).toEqual(c);
    expect(restored.initial(targets, 10)).toEqual(b);
    expect(restored.initial(targets, 11)).toEqual(c);
    expect(restored.initial(targets, 99)).toBeUndefined();
  });
  it("falls back within a student after removal, and drops views when the PDF or pages change", () => {
    const entry = open(); entry.remember(b, "by-student"); entry.worksheet.set(2, view); entry.answer.set(2, view); entry.changed(); entry.flush();
    const restored = open();
    expect(restored.initial([a, c])).toEqual(a);
    const changed = lessonTarget(10, file(2, "B.pdf", 2));
    restored.reconcile([a, changed, c]);
    expect(restored.initial([a, changed, c])).toEqual(changed);
    expect(restored.worksheet.has(2)).toBe(false);
    expect(restored.answer.has(2)).toBe(false);
    expect(lessonTarget(10, file(2, "C.pdf")).source).not.toBe(b.source);
  });
  it("separates date, normalised slot, tutor and actual centre", () => {
    const key = lessonClassKey("2026-11-09", "9:00-10:30", 7, "A");
    expect(key).toBe(lessonClassKey("2026-11-09", "09:00 - 10:30", 7, "A"));
    const entry = open(key); entry.remember(b, "by-student"); entry.flush();
    for (const other of [lessonClassKey("2026-11-10", "9:00-10:30", 7, "A"), lessonClassKey("2026-11-09", "10:30-12:00", 7, "A"), lessonClassKey("2026-11-09", "9:00-10:30", 8, "A"), lessonClassKey("2026-11-09", "9:00-10:30", 7, "B")]) expect(open(other).selected).toBeNull();
    expect(open(key).selected).toEqual(b);
  });
  it("rejects late reading events from the old worksheet after its source changes", () => {
    const entry = open();
    const replacement = lessonTarget(10, file(2, "Replacement.pdf"));
    entry.reconcile([a, replacement, c]);
    entry.worksheet.set(2, view);
    entry.capture(2, b.source); entry.flush();
    expect(entry.worksheet.has(2)).toBe(false);
    entry.worksheet.set(2, { ...view, scrollTop: 0 });
    entry.capture(2, replacement.source); entry.flush();
    const restored = new LessonResumeEntry(memory, "class"); restored.reconcile([a, replacement, c]);
    expect(restored.worksheet.get(2)?.scrollTop).toBe(0);
  });
  it("prevents an old frame from writing after an identity or view-scope change", () => {
    const entry = open(); entry.remember(b, "by-student");
    activateLessonResumeScope("another viewer"); entry.flush();
    expect(new LessonResumeEntry(new LessonResumeMemory("another viewer"), "class").selected).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(LESSON_RESUME_STORAGE)!).scope).toBe("another viewer");
    activateLessonResumeScope(null); entry.changed(); entry.flush();
    expect(sessionStorage.getItem(LESSON_RESUME_STORAGE)).toBeNull();
  });
  it("coalesces scrolling and bounds the number of classes retained in the tab", () => {
    const save = vi.spyOn(Storage.prototype, "setItem");
    const entry = open(); entry.remember(b, "by-student");
    for (let i = 0; i < 20; i++) { entry.worksheet.set(2, { ...view, scrollTop: i }); entry.changed(); }
    expect(save).not.toHaveBeenCalled(); vi.advanceTimersByTime(250);
    expect(save).toHaveBeenCalledOnce(); expect(open().worksheet.get(2)?.scrollTop).toBe(19);
    for (let i = 0; i < 9; i++) { const next = open(String(i)); next.remember(a, "by-student"); next.flush(); }
    expect(JSON.parse(sessionStorage.getItem(LESSON_RESUME_STORAGE)!).lessons).toHaveLength(8);
    expect(open("0").selected).toBeNull(); expect(open("8").selected).toEqual(a);
  });
  it("ignores malformed or blocked storage instead of breaking the lesson", () => {
    sessionStorage.setItem(LESSON_RESUME_STORAGE, '{"scope":"viewer","lessons":[null]}');
    expect(open().selected).toBeNull();
    activateLessonResumeScope("viewer");
    sessionStorage.setItem(LESSON_RESUME_STORAGE, JSON.stringify({scope:"viewer",lessons:[["class",{selected:{exerciseId:1},worksheet:[[1,a.source,{...view,zoom:-1}]]}]]}));
    expect(open().worksheet.size).toBe(0); expect(open().selected).toBeNull();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Full"); });
    expect(() => { const entry = open(); entry.remember(a, "by-student"); entry.flush(); }).not.toThrow();
  });
});
