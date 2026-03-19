/**
 * PDF utilities for page parsing and extraction using PDF.js
 * Note: PDF.js functions use dynamic imports to avoid SSR issues
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PDFDocument, PDFFont } from 'pdf-lib';

// Lazy-loaded PDF.js library (only loaded when needed, client-side only)
let pdfjsLib: typeof import('pdfjs-dist') | null = null;

// Cached CJK font bytes (fetched once, reused across stamp operations)
let cachedFontBytes: ArrayBuffer | null = null;

async function getCjkFontBytes(): Promise<ArrayBuffer> {
  if (cachedFontBytes) return cachedFontBytes;
  const response = await fetch('/fonts/NotoSansTC-Regular.ttf');
  cachedFontBytes = await response.arrayBuffer();
  return cachedFontBytes;
}

/** Check if text contains any non-ASCII characters (CJK, etc.) */
function hasNonAscii(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.codePointAt(i)! > 0x7F) return true;
  }
  return false;
}

interface StampFonts {
  latin: PDFFont;  // Helvetica — proportional ASCII/digits
  cjk: PDFFont;    // Noto Sans TC — CJK characters (or Helvetica if not needed)
}

/** Embed fonts for stamp text. Skips 6.8MB CJK font if all text is ASCII. */
async function embedStampFonts(pdfDoc: PDFDocument, stampTexts: string[]): Promise<StampFonts> {
  const { StandardFonts } = await import('pdf-lib');
  const latin = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const needsCjk = stampTexts.some(hasNonAscii);
  if (!needsCjk) return { latin, cjk: latin };

  const fontkit = await import('fontkit');
  pdfDoc.registerFontkit(fontkit);
  const fontBytes = await getCjkFontBytes();
  const cjk = await pdfDoc.embedFont(fontBytes, { subset: false });
  return { latin, cjk };
}

/** Pick font per character: Helvetica for ASCII, Noto Sans TC for CJK */
function fontForChar(ch: string, fonts: StampFonts): PDFFont {
  return ch.codePointAt(0)! <= 0x7F ? fonts.latin : fonts.cjk;
}

/** Split text into runs of same-font characters */
function splitIntoRuns(text: string, fonts: StampFonts): Array<{ text: string; font: PDFFont }> {
  if (text.length === 0) return [];
  const runs: Array<{ text: string; font: PDFFont }> = [];
  let currentFont = fontForChar(text[0], fonts);
  let currentText = text[0];
  for (let i = 1; i < text.length; i++) {
    const font = fontForChar(text[i], fonts);
    if (font === currentFont) {
      currentText += text[i];
    } else {
      runs.push({ text: currentText, font: currentFont });
      currentFont = font;
      currentText = text[i];
    }
  }
  runs.push({ text: currentText, font: currentFont });
  return runs;
}

/** Measure mixed-font text width */
function measureMixedText(text: string, fonts: StampFonts, size: number): number {
  return splitIntoRuns(text, fonts).reduce(
    (w, run) => w + run.font.widthOfTextAtSize(run.text, size), 0
  );
}

/** Draw mixed-font text on a PDF page */
function drawMixedText(
  page: { drawText: (text: string, opts: Record<string, unknown>) => void },
  text: string, x: number, y: number,
  fonts: StampFonts, size: number, color: unknown
) {
  let cx = x;
  for (const run of splitIntoRuns(text, fonts)) {
    page.drawText(run.text, { x: cx, y, size, font: run.font, color });
    cx += run.font.widthOfTextAtSize(run.text, size);
  }
}

export async function getPdfJs() {
  if (typeof window === 'undefined') {
    throw new Error('PDF.js can only be used in the browser');
  }

  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    // Use unpkg CDN which directly serves npm package files
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }

  return pdfjsLib;
}

/**
 * Parse a page range string into an array of page numbers
 * Supports flexible input like:
 * - "1", "1-5", "1,3,5", "1,3,5-7,10"
 * - "1, 3, 5 ~ 7" (with spaces around range separator)
 * - "1,3,5-7 (not done)" (with text remarks - they're ignored)
 *
 * @param range - Page range string like "1,3,5-7"
 * @returns Array of page numbers [1, 3, 5, 6, 7]
 */
export function parsePageRange(range: string): number[] {
  if (!range || !range.trim()) return [];

  const pages: Set<number> = new Set();

  // Normalize the input:
  // 1. Replace ~ and various unicode dashes with standard hyphen
  // 2. Remove spaces around hyphens (so "5 - 7" becomes "5-7")
  // 3. Remove any text that's not digits, commas, hyphens, or spaces
  // 4. Collapse multiple spaces
  const normalized = range
    .replace(/[~–—]/g, '-')  // Replace ~ and various dashes with hyphen
    .replace(/\s*-\s*/g, '-')  // Remove spaces around hyphens: "5 - 7" → "5-7"
    .replace(/[^\d,\-\s]/g, ' ')  // Replace non-numeric/separator chars with space
    .replace(/\s+/g, ' ')  // Collapse multiple spaces
    .trim();

  // Split by comma or space (flexible separator)
  const parts = normalized.split(/[,\s]+/).filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      // Range like "5-10"
      const rangeParts = part.split('-').filter(Boolean);
      if (rangeParts.length >= 2) {
        const start = parseInt(rangeParts[0], 10);
        const end = parseInt(rangeParts[rangeParts.length - 1], 10);

        if (!isNaN(start) && !isNaN(end) && start > 0 && end >= start) {
          for (let i = start; i <= end; i++) {
            pages.add(i);
          }
        }
      } else if (rangeParts.length === 1) {
        // Just a number with trailing/leading dash, treat as single page
        const page = parseInt(rangeParts[0], 10);
        if (!isNaN(page) && page > 0) {
          pages.add(page);
        }
      }
    } else {
      // Single page like "5"
      const page = parseInt(part, 10);
      if (!isNaN(page) && page > 0) {
        pages.add(page);
      }
    }
  }

  return Array.from(pages);
}

/**
 * Validate a page range string
 * Now uses lenient parsing - just checks if we can extract any valid pages
 *
 * @param range - Page range string to validate
 * @param totalPages - Optional total page count for bounds checking
 * @returns true if valid (has at least one extractable page), false otherwise
 */
export function validatePageRange(range: string, totalPages?: number): boolean {
  if (!range || !range.trim()) return true; // Empty is valid (means "all pages")

  // Use the lenient parser to extract pages
  const pages = parsePageRange(range);

  // Valid if we extracted at least one page number
  if (pages.length === 0) return false;

  // Check bounds if totalPages provided
  if (totalPages !== undefined) {
    return pages.every(p => p <= totalPages);
  }

  return true;
}

/**
 * Get total page count from a PDF
 *
 * @param pdfData - PDF data as ArrayBuffer
 * @returns Total number of pages
 */
export async function getPageCount(pdfData: ArrayBuffer): Promise<number> {
  const pdfjs = await getPdfJs();
  const pdf = await pdfjs.getDocument({ data: pdfData }).promise;
  const numPages = pdf.numPages;
  await pdf.destroy();
  return numPages;
}

/**
 * Print stamp info to display on each printed page
 */
export interface PrintStampInfo {
  location?: string;
  schoolStudentId?: string;
  studentName?: string;
  sessionDate?: string;
  sessionTime?: string;
  printedBy?: string;
}

/**
 * Format stamp info into a display string
 */
function formatStamp(stamp: PrintStampInfo): string {
  const parts: string[] = [];

  // Location-StudentID format
  if (stamp.location || stamp.schoolStudentId) {
    parts.push([stamp.location, stamp.schoolStudentId].filter(Boolean).join('-'));
  }

  if (stamp.studentName) parts.push(stamp.studentName);
  if (stamp.sessionDate) parts.push(stamp.sessionDate);
  if (stamp.sessionTime) parts.push(stamp.sessionTime);

  // Add printed timestamp
  const now = new Date();
  const printedAt = now.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  parts.push(`Printed: ${printedAt}`);

  if (stamp.printedBy) parts.push(`by ${stamp.printedBy}`);

  return parts.join(' | ');
}

/**
 * Add stamp overlay to all pages of a PDF using pdf-lib.
 * Returns a new PDF blob (not HTML). Much faster and more reliable
 * than canvas rendering — uses the browser's native PDF viewer for printing.
 *
 * @param pdfData - Original PDF data as ArrayBuffer
 * @param stamp - Stamp info to display on each page
 * @returns Blob containing the stamped PDF
 */
export async function stampPdf(
  pdfData: ArrayBuffer,
  stamp: PrintStampInfo
): Promise<Blob> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
  const baseStampText = formatStamp(stamp);
  const fonts = await embedStampFonts(pdfDoc, [baseStampText]);
  const fontSize = 8;
  const color = rgb(0.2, 0.2, 0.2);
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;

  pages.forEach((page, idx) => {
    const stampText = `${baseStampText} | p.${idx + 1}/${totalPages}`;
    const { width, height } = page.getSize();
    const textWidth = measureMixedText(stampText, fonts, fontSize);
    drawMixedText(page, stampText, width - textWidth - 40, height - 25, fonts, fontSize, color);
  });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

/**
 * Extract specific pages from a PDF and return as a new PDF blob.
 * Uses pdf-lib for reliable page extraction and optional stamp overlay.
 *
 * @param pdfData - Original PDF data as ArrayBuffer
 * @param pageNumbers - Array of page numbers to extract (1-indexed). Empty = all pages.
 * @param stamp - Optional stamp info to display on each page
 * @returns Blob containing the extracted pages as a PDF
 */
export async function extractPagesForPrint(
  pdfData: ArrayBuffer,
  pageNumbers: number[],
  stamp?: PrintStampInfo
): Promise<Blob> {
  return extractBulkPagesForDownload(
    [{ pdfData, pageNumbers, label: '' }],
    stamp
  );
}

/**
 * Item for bulk printing - contains PDF data and page selection
 */
export interface BulkPrintItem {
  pdfData: ArrayBuffer;
  pageNumbers: number[];
  label?: string;  // Optional label for the document
  stamp?: PrintStampInfo;  // Per-item stamp override (used for multi-student bulk print)
}

/**
 * Extract pages from multiple PDFs and combine into a single printable PDF blob.
 * Supports per-item stamps with global stamp fallback.
 *
 * @param items - Array of PDF items with their page selections
 * @param stamp - Optional global stamp info (per-item stamp takes priority)
 * @returns Blob containing combined pages as a PDF
 */
export async function extractBulkPagesForPrint(
  items: BulkPrintItem[],
  stamp?: PrintStampInfo
): Promise<Blob> {
  return extractBulkPagesForDownload(items, stamp);
}

/**
 * Extract and combine pages from multiple PDFs into a single PDF file.
 * Used for both printing and downloading. Supports per-item stamps with global fallback.
 *
 * @param items - Array of PDFs with their page ranges and optional per-item stamps
 * @param stamp - Optional global stamp (per-item stamp takes priority)
 * @returns Blob containing the combined PDF
 */
export async function extractBulkPagesForDownload(
  items: BulkPrintItem[],
  stamp?: PrintStampInfo
): Promise<Blob> {
  // Dynamically import pdf-lib to avoid bundling issues
  const { PDFDocument, rgb } = await import('pdf-lib');

  const pdfDoc = await PDFDocument.create();

  // Track page ranges per item for per-item stamp support
  const itemPageRanges: Array<{ startIdx: number; endIdx: number; itemStamp?: PrintStampInfo }> = [];

  // Helper to identify student boundaries by stamp identity
  const studentKey = (s?: PrintStampInfo) => s ? JSON.stringify(s) : '';
  let studentStartPageIdx = 0;

  for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
    const item = items[itemIdx];
    const startIdx = pdfDoc.getPageCount();
    try {
      // Load source PDF
      const srcDoc = await PDFDocument.load(item.pdfData, { ignoreEncryption: true });

      // Determine pages to copy (convert from 1-indexed to 0-indexed)
      const pageIndices = item.pageNumbers.length > 0
        ? item.pageNumbers.map(n => n - 1).filter(i => i >= 0 && i < srcDoc.getPageCount())
        : Array.from({ length: srcDoc.getPageCount() }, (_, i) => i);

      if (pageIndices.length === 0) continue;

      // Copy pages to destination
      const copiedPages = await pdfDoc.copyPages(srcDoc, pageIndices);
      copiedPages.forEach(page => pdfDoc.addPage(page));
    } catch (err) {
      // Continue with other PDFs even if one fails
    }
    itemPageRanges.push({ startIdx, endIdx: pdfDoc.getPageCount(), itemStamp: item.stamp });

    // Insert blank page at student boundaries for double-sided printing
    const nextItem = items[itemIdx + 1];
    const isLastItem = itemIdx === items.length - 1;
    const isStudentBoundary = !isLastItem && studentKey(item.stamp) !== studentKey(nextItem?.stamp);
    if (isStudentBoundary) {
      const studentPageCount = pdfDoc.getPageCount() - studentStartPageIdx;
      if (studentPageCount % 2 !== 0) {
        // Add blank page matching the last page's dimensions
        const lastPage = pdfDoc.getPage(pdfDoc.getPageCount() - 1);
        const { width, height } = lastPage.getSize();
        pdfDoc.addPage([width, height]);
      }
      studentStartPageIdx = pdfDoc.getPageCount();
    }
  }

  // Add stamp overlays — per-item stamp takes priority, then global stamp
  // Page numbering is continuous across items sharing the same stamp
  const hasAnyStamp = stamp || items.some(item => item.stamp);
  if (hasAnyStamp) {
    // Group by stamp identity for continuous page numbering
    const stampKey = (s: PrintStampInfo) => JSON.stringify(s);

    // Pre-compute stamp texts and totals per stamp group
    const stampGroupTotals = new Map<string, number>();
    const stampGroupTexts = new Map<string, string>();
    for (const range of itemPageRanges) {
      const effectiveStamp = range.itemStamp || stamp;
      if (!effectiveStamp) continue;
      const key = stampKey(effectiveStamp);
      stampGroupTotals.set(key, (stampGroupTotals.get(key) || 0) + (range.endIdx - range.startIdx));
      if (!stampGroupTexts.has(key)) stampGroupTexts.set(key, formatStamp(effectiveStamp));
    }

    const fonts = await embedStampFonts(pdfDoc, Array.from(stampGroupTexts.values()));
    const fontSize = 8;
    const color = rgb(0.2, 0.2, 0.2);
    const allPages = pdfDoc.getPages();

    // Running counter per stamp group
    const stampGroupCounters = new Map<string, number>();

    for (const range of itemPageRanges) {
      const effectiveStamp = range.itemStamp || stamp;
      if (!effectiveStamp) continue;

      const key = stampKey(effectiveStamp);
      const groupTotal = stampGroupTotals.get(key) || 0;
      const baseStampText = stampGroupTexts.get(key)!;

      for (let i = range.startIdx; i < range.endIdx; i++) {
        const counter = (stampGroupCounters.get(key) || 0) + 1;
        stampGroupCounters.set(key, counter);
        const stampText = `${baseStampText} | p.${counter}/${groupTotal}`;
        const textWidth = measureMixedText(stampText, fonts, fontSize);
        const page = allPages[i];
        const { width, height } = page.getSize();
        drawMixedText(page, stampText, width - textWidth - 40, height - 25, fonts, fontSize, color);
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

/**
 * Load a PDF document from URL (for preview)
 *
 * @param url - URL to the PDF
 * @returns PDFDocumentProxy
 */
export async function loadPdfFromUrl(url: string): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfJs();
  return pdfjs.getDocument(url).promise;
}

/**
 * Get page count from a PDF URL
 *
 * @param url - URL to the PDF
 * @returns Total number of pages
 */
export async function getPageCountFromUrl(url: string): Promise<number> {
  const pdf = await loadPdfFromUrl(url);
  const numPages = pdf.numPages;
  await pdf.destroy();
  return numPages;
}
