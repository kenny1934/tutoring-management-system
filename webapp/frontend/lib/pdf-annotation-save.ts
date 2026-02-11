/**
 * Save annotations into a PDF by rendering strokes as PNG images
 * embedded on each page via pdf-lib.
 */
import getStroke from "perfect-freehand";
import { extractPagesForPrint } from "./pdf-utils";
import type { PrintStampInfo } from "./pdf-utils";
import { RENDER_SCALE, getStrokeOptions } from "@/hooks/useAnnotations";
import type { PageAnnotations, Stroke } from "@/hooks/useAnnotations";

/** Draw a single stroke onto a canvas context. */
function drawStrokeToCanvas(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  scale: number,
) {
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
  ctx.globalAlpha = 0.85;
  ctx.fill();
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

  for (const stroke of strokes) {
    drawStrokeToCanvas(ctx, stroke, quality);
  }

  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/png")
  );
  return blob.arrayBuffer();
}

/**
 * Create a PDF with annotations embedded as PNG overlays on each page.
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
  const { PDFDocument } = await import("pdf-lib");
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

  // Step 4: Save
  const finalBytes = await pdfDoc.save();
  return new Blob([finalBytes], { type: "application/pdf" });
}
