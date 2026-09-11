import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";
import { buildAnnotatedZip, hasInk, saveAllFailedMessage, type AnnotatedExercise } from "./annotated-zip";
import type { Stroke } from "@/hooks/useAnnotations";

// Drawing ink into a real PDF needs a canvas, which jsdom doesn't have, so the
// saver is replaced by one that fails for any PDF whose first byte is 0.
const saveAnnotatedPdf = vi.fn(async (pdf: ArrayBuffer) => {
  if (new Uint8Array(pdf)[0] === 0) throw new Error("broken PDF");
  return new Blob(["saved"], { type: "application/pdf" });
});
vi.mock("./pdf-annotation-save", () => ({
  saveAnnotatedPdf: (...args: Parameters<typeof saveAnnotatedPdf>) => saveAnnotatedPdf(...args),
}));

const DOT: Stroke = { points: [[10, 10, 0.5]], color: "#dc2626", size: 3 };
const GOOD_PDF = new Uint8Array([1]).buffer;
const BROKEN_PDF = new Uint8Array([0]).buffer;

function exercise(pdfName: string, name = pdfName.replace(/\.pdf$/, "")): AnnotatedExercise {
  return { pdfName, pageNumbers: [], stamp: undefined, annotations: { 0: [DOT] }, name };
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
    const result = await buildAnnotatedZip([exercise("a.pdf"), exercise("b.pdf")], loadPdf);

    expect(loadPdf.mock.calls.map(([name]) => name)).toEqual(["a.pdf", "b.pdf"]);
    expect(result).toMatchObject({ saved: 2, failed: 0 });
    expect(await zipNames(result.zip)).toEqual(["a.pdf", "b.pdf"]);
  });

  it("counts a file that can't be found, or can't be drawn on, as failed and still saves the rest", async () => {
    const loadPdf = async (name: string) =>
      name === "missing.pdf" ? null : name === "broken.pdf" ? BROKEN_PDF : GOOD_PDF;
    const result = await buildAnnotatedZip(
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
    const result = await buildAnnotatedZip([exercise("a.pdf"), exercise("b.pdf")], loadPdf);
    expect(result).toMatchObject({ saved: 1, failed: 1 });
  });

  it("makes no ZIP at all when nothing could be saved", async () => {
    const result = await buildAnnotatedZip([exercise("a.pdf")], async () => null);
    expect(result).toEqual({ zip: null, saved: 0, failed: 1 });
  });

  it("numbers repeated names instead of letting one file replace another", async () => {
    const result = await buildAnnotatedZip(
      [exercise("x.pdf", "annotated-Worksheet"), exercise("y.pdf", "annotated-Worksheet")],
      async () => GOOD_PDF,
    );
    expect(await zipNames(result.zip)).toEqual(["annotated-Worksheet (2).pdf", "annotated-Worksheet.pdf"]);
  });
});

describe("hasInk", () => {
  it("is true only when some page holds a stroke", () => {
    expect(hasInk(undefined)).toBe(false);
    expect(hasInk({})).toBe(false);
    expect(hasInk({ 0: [], 1: [] })).toBe(false);
    expect(hasInk({ 0: [], 1: [DOT] })).toBe(true);
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
