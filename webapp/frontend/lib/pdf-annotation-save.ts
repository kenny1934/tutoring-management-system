/**
 * Save annotations into a PDF by rendering strokes as PNG images
 * embedded on each page via pdf-lib.
 */
import getStroke from "perfect-freehand";
import { extractPagesForPrint } from "./pdf-utils";
import type { PrintStampInfo } from "./pdf-utils";
import { INK, RENDER_SCALE, getStrokeOptions, inkLayers, kindOf, strokeOpacity } from "@/hooks/useAnnotations";
import type { PageAnnotations, Stroke } from "@/hooks/useAnnotations";
import { DRAFT_GRID_COLOUR, DRAFT_SHEET_PT, DRAFT_SQUARE_PT, draftSquared, inkedDraftPages } from "./draft-sheets";
import type { PDFDocument as PdfDocument, PDFPage, RGB } from "pdf-lib";

/**
 * Draw a single stroke onto a canvas context. A one-point stroke from a tap
 * has a small circle for an outline, so it's drawn as a dot like any other.
 * Exact ink, the marks and numbers on a pair of axes, is drawn as a line
 * through its points, as it is on screen.
 */
export function drawStrokeToCanvas(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  scale: number,
) {
  if (INK[kindOf(stroke)].exact) {
    drawLineToCanvas(ctx, stroke, scale);
    return;
  }
  const outlinePoints = getStroke(stroke.points, getStrokeOptions(stroke, true));

  if (outlinePoints.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(outlinePoints[0][0] * scale, outlinePoints[0][1] * scale);

  for (let i = 1; i < outlinePoints.length - 1; i++) {
    const cp = outlinePoints[i];
    const next = outlinePoints[i + 1];
    const mx = (cp[0] + next[0]) / 2;
    const my = (cp[1] + next[1]) / 2;
    ctx.quadraticCurveTo(cp[0] * scale, cp[1] * scale, mx * scale, my * scale);
  }

  ctx.closePath();
  ctx.fillStyle = stroke.color;
  ctx.globalAlpha = strokeOpacity(stroke);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * Exact ink is a line of the stroke's width joining its points, with rounded
 * corners and ends, and a single point of it is a dot the same width across.
 */
function drawLineToCanvas(ctx: CanvasRenderingContext2D, stroke: Stroke, scale: number) {
  const [first, ...rest] = stroke.points;
  if (!first) return;
  ctx.beginPath();
  ctx.globalAlpha = strokeOpacity(stroke);
  if (rest.length === 0) {
    ctx.arc(first[0] * scale, first[1] * scale, (stroke.size / 2) * scale, 0, 2 * Math.PI);
    ctx.fillStyle = stroke.color;
    ctx.fill();
  } else {
    ctx.moveTo(first[0] * scale, first[1] * scale);
    for (const [x, y] of rest) ctx.lineTo(x * scale, y * scale);
    ctx.lineWidth = stroke.size * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.color;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * Render annotations to a PNG ArrayBuffer.
 *
 * Annotation coordinates are in CSS pixel space (pdfPoints * RENDER_SCALE).
 * We render the canvas at that coordinate space, then pdf-lib scales the
 * resulting image to fill the PDF page.
 *
 * @param strokes - Strokes in CSS pixel coordinates
 * @param pdfWidth - PDF page width in points
 * @param pdfHeight - PDF page height in points
 */
async function renderPageAnnotations(
  strokes: Stroke[],
  pdfWidth: number,
  pdfHeight: number,
): Promise<ArrayBuffer | null> {
  if (!strokes || strokes.length === 0) return null;

  // Annotation coordinate space = pdfPoints * RENDER_SCALE
  const cssWidth = pdfWidth * RENDER_SCALE;
  const cssHeight = pdfHeight * RENDER_SCALE;

  // Render at 2x the CSS pixel dimensions for crisp output
  const quality = 2;
  const canvas = document.createElement("canvas");
  canvas.width = cssWidth * quality;
  canvas.height = cssHeight * quality;
  const ctx = canvas.getContext("2d")!;

  // Highlighter goes down first so pen ink sits on top of it, as on screen.
  for (const stroke of inkLayers(strokes).flat()) {
    drawStrokeToCanvas(ctx, stroke, quality);
  }

  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/png")
  );
  return blob.arrayBuffer();
}

/** Rule a Draft sheet into squares from its top-left corner, the way the screen does. */
function ruleSquares(page: PDFPage, colour: RGB) {
  const { width, height } = page.getSize();
  const line = { thickness: 0.5, color: colour };
  for (let x = 0; x <= width; x += DRAFT_SQUARE_PT) {
    page.drawLine({ start: { x, y: 0 }, end: { x, y: height }, ...line });
  }
  for (let y = 0; y <= height; y += DRAFT_SQUARE_PT) {
    page.drawLine({ start: { x: 0, y: height - y }, end: { x: width, y: height - y }, ...line });
  }
}

/**
 * Create a PDF with annotations embedded as PNG overlays on each page. Any
 * Draft sheets with ink are added after the worksheet's pages.
 *
 * @param pdfData - Raw PDF ArrayBuffer
 * @param pageNumbers - Pages to extract (1-indexed, empty = all)
 * @param stamp - Optional stamp info
 * @param annotations - Annotation strokes keyed by page index
 * @returns Blob of the annotated PDF
 */
export async function saveAnnotatedPdf(
  pdfData: ArrayBuffer,
  pageNumbers: number[],
  stamp: PrintStampInfo | undefined,
  annotations: PageAnnotations,
): Promise<Blob> {
  // Step 1: Get stamped + extracted PDF
  const stampedBlob = await extractPagesForPrint(pdfData, pageNumbers, stamp);
  const stampedBytes = await stampedBlob.arrayBuffer();

  // Step 2: Load into pdf-lib
  const { PDFDocument, rgb } = await import("pdf-lib");
  const pdfDoc = await PDFDocument.load(stampedBytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  // Step 3: For each page with annotations, render and embed
  for (let i = 0; i < pages.length; i++) {
    const strokes = annotations[i];
    if (!strokes || strokes.length === 0) continue;

    const page = pages[i];
    const { width, height } = page.getSize();

    const pngData = await renderPageAnnotations(strokes, width, height);
    if (!pngData) continue;

    const pngImage = await pdfDoc.embedPng(pngData);

    // Draw the annotation image over the entire page
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width,
      height,
    });
  }

  // Step 4: Add the Draft's sheets that have ink, blank or squared as they are on screen
  await addDraftSheets(pdfDoc, rgb(...DRAFT_GRID_COLOUR.rgb), annotations);

  // Step 5: Save
  const finalBytes = await pdfDoc.save();
  return new Blob([finalBytes], { type: "application/pdf" });
}

/** Add the Draft's sheets that have ink to the end of a PDF, blank or squared as they are on screen. */
async function addDraftSheets(pdfDoc: PdfDocument, grid: RGB, annotations: PageAnnotations) {
  const squared = draftSquared.get();
  for (const pageIndex of inkedDraftPages(annotations)) {
    const { width, height } = DRAFT_SHEET_PT;
    const sheet = pdfDoc.addPage([width, height]);
    if (squared) ruleSquares(sheet, grid);
    const pngData = await renderPageAnnotations(annotations[pageIndex], width, height);
    if (pngData) sheet.drawImage(await pdfDoc.embedPng(pngData), { x: 0, y: 0, width, height });
  }
}

/**
 * A PDF of nothing but Draft sheets, for a lesson's own Draft, which has no
 * worksheet behind it. As with an exercise's Draft, only the sheets with ink
 * are kept.
 */
export async function saveDraftSheetsPdf(annotations: PageAnnotations): Promise<Blob> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const pdfDoc = await PDFDocument.create();
  await addDraftSheets(pdfDoc, rgb(...DRAFT_GRID_COLOUR.rgb), annotations);
  const bytes = await pdfDoc.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
