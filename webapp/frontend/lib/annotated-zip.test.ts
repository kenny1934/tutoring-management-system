import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";
import { buildAnnotatedZip, lessonDraftForZip, saveAllFailedMessage, type AnnotatedExercise } from "./annotated-zip";
import type { PageAnnotations, Stroke } from "@/hooks/useAnnotations";

// Drawing ink into a real PDF needs a canvas, which jsdom doesn't have, so the
// saver is replaced by one that fails for any PDF whose first byte is 0.
const saveAnnotatedPdf = vi.fn(async (pdf: ArrayBuffer) => {
  if (new Uint8Array(pdf)[0] === 0) throw new Error("broken PDF");
  return new Blob(["saved"], { type: "application/pdf" });
});
// A lesson's own Draft is saved as its sheets on their own, which needs a canvas too.
const saveDraftSheetsPdf = vi.fn(async (_annotations: PageAnnotations) => new Blob(["draft"], { type: "application/pdf" }));
vi.mock("./pdf-annotation-save", () => ({
  saveAnnotatedPdf: (...args: Parameters<typeof saveAnnotatedPdf>) => saveAnnotatedPdf(...args),
  saveDraftSheetsPdf: (...args: Parameters<typeof saveDraftSheetsPdf>) => saveDraftSheetsPdf(...args),
}));

const DOT: Stroke = { points: [[10, 10, 0.5]], color: "#dc2626", size: 3 };
const GOOD_PDF = new Uint8Array([1]).buffer;
const BROKEN_PDF = new Uint8Array([0]).buffer;

function exercise(pdfName: string, name = pdfName.replace(/\.pdf$/, "")): AnnotatedExercise {
  return { pdfName, pageNumbers: [], stamp: undefined, name };
}

/** Build a ZIP where exercise n, counting from 1, is the nth in the list and has one stroke of ink. */
function zipOf(exercises: AnnotatedExercise[], loadPdf: (pdfName: string) => Promise<ArrayBuffer | null>) {
  const ink = new Map(exercises.map((_, i) => [i + 1, { 0: [DOT] }]));
  return buildAnnotatedZip(ink, (id) => exercises[id - 1], loadPdf);
}

async function zipNames(zip: Blob | null): Promise<string[]> {
  if (!zip) return [];
  const opened = await JSZip.loadAsync(zip);
  return Object.keys(opened.files).sort();
}

describe("buildAnnotatedZip", () => {
  beforeEach(() => saveAnnotatedPdf.mockClear());

  it("asks the loader for every PDF, so exercises that were never cached still get saved", async () => {
    const loadPdf = vi.fn(async (_pdfName: string) => GOOD_PDF);
    const result = await zipOf([exercise("a.pdf"), exercise("b.pdf")], loadPdf);

    expect(loadPdf.mock.calls.map(([name]) => name)).toEqual(["a.pdf", "b.pdf"]);
    expect(result).toMatchObject({ saved: 2, failed: 0 });
    expect(await zipNames(result.zip)).toEqual(["a.pdf", "b.pdf"]);
  });

  it("saves a lesson's own Draft as its sheets on their own, with no file to load", async () => {
    const loadPdf = vi.fn(async (_pdfName: string) => GOOD_PDF);
    const draftInk: PageAnnotations = { 1000: [DOT] };
    const ink = new Map<number, PageAnnotations>([[1, { 0: [DOT] }], [-10_000_000_100, draftInk]]);
    const result = await buildAnnotatedZip(
      ink,
      (id) => (id === 1 ? exercise("a.pdf") : lessonDraftForZip("lesson-draft")),
      loadPdf,
    );

    expect(loadPdf.mock.calls.map(([name]) => name)).toEqual(["a.pdf"]);
    expect(saveDraftSheetsPdf).toHaveBeenCalledWith(draftInk);
    expect(result).toMatchObject({ saved: 2, failed: 0 });
    expect(await zipNames(result.zip)).toEqual(["a.pdf", "lesson-draft.pdf"]);
  });

  it("works through the ink, so only exercises with some are asked about", async () => {
    const describe = vi.fn((id: number) => exercise(`${id}.pdf`));
    const ink = new Map<number, PageAnnotations>([[1, { 0: [DOT] }], [2, { 0: [] }], [-5, { 3: [DOT] }]]);
    const result = await buildAnnotatedZip(ink, describe, async () => GOOD_PDF);

    expect(describe.mock.calls.map(([id]) => id)).toEqual([1, -5]);
    expect(await zipNames(result.zip)).toEqual(["-5.pdf", "1.pdf"]);
  });

  it("counts ink whose exercise can't be found as failed, so the views keep it", async () => {
    const ink = new Map([[1, { 0: [DOT] }], [99, { 0: [DOT] }]]);
    const result = await buildAnnotatedZip(ink, (id) => (id === 1 ? exercise("a.pdf") : null), async () => GOOD_PDF);

    expect(result).toMatchObject({ saved: 1, failed: 1 });
    expect(await zipNames(result.zip)).toEqual(["a.pdf"]);
  });

  it("starts every load at once, and loads a file that two exercises share only once", async () => {
    let loading = 0;
    let mostAtOnce = 0;
    const loadPdf = vi.fn(async (_pdfName: string) => {
      loading++;
      mostAtOnce = Math.max(mostAtOnce, loading);
      await new Promise((resolve) => setTimeout(resolve, 0));
      loading--;
      return GOOD_PDF;
    });
    const result = await zipOf(
      [exercise("a.pdf", "annotated-CW"), exercise("a.pdf", "annotated-HW"), exercise("b.pdf")],
      loadPdf,
    );

    expect(loadPdf.mock.calls.map(([name]) => name)).toEqual(["a.pdf", "b.pdf"]);
    expect(mostAtOnce).toBe(2);
    expect(result).toMatchObject({ saved: 3, failed: 0 });
  });

  it("counts a file that can't be found, or can't be drawn on, as failed and still saves the rest", async () => {
    const loadPdf = async (name: string) =>
      name === "missing.pdf" ? null : name === "broken.pdf" ? BROKEN_PDF : GOOD_PDF;
    const result = await zipOf(
      [exercise("missing.pdf"), exercise("broken.pdf"), exercise("fine.pdf")],
      loadPdf,
    );

    expect(result).toMatchObject({ saved: 1, failed: 2 });
    expect(await zipNames(result.zip)).toEqual(["fine.pdf"]);
  });

  it("counts a loader that throws as a failure rather than giving up on the whole ZIP", async () => {
    const loadPdf = async (name: string) => {
      if (name === "a.pdf") throw new Error("network");
      return GOOD_PDF;
    };
    const result = await zipOf([exercise("a.pdf"), exercise("b.pdf")], loadPdf);
    expect(result).toMatchObject({ saved: 1, failed: 1 });
  });

  it("makes no ZIP at all when nothing could be saved", async () => {
    const result = await zipOf([exercise("a.pdf")], async () => null);
    expect(result).toEqual({ zip: null, saved: 0, failed: 1 });
  });

  it("numbers repeated names instead of letting one file replace another", async () => {
    const result = await zipOf(
      [exercise("x.pdf", "annotated-Worksheet"), exercise("y.pdf", "annotated-Worksheet")],
      async () => GOOD_PDF,
    );
    expect(await zipNames(result.zip)).toEqual(["annotated-Worksheet (2).pdf", "annotated-Worksheet.pdf"]);
  });
});

describe("saveAllFailedMessage", () => {
  it("says how many of the exercises couldn't be downloaded", () => {
    expect(saveAllFailedMessage({ saved: 5, failed: 2 })).toBe(
      "2 of 7 exercises couldn't be downloaded, so your ink has been kept and the lesson is still open.",
    );
  });

  it("has its own wording when none could be downloaded", () => {
    expect(saveAllFailedMessage({ saved: 0, failed: 3 })).toBe(
      "None of the annotated exercises could be downloaded, so your ink has been kept and the lesson is still open.",
    );
  });
});
