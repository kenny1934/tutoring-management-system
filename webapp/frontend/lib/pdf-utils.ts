/**
 * PDF utilities for page parsing and extraction using PDF.js
 * Note: PDF.js functions use dynamic imports to avoid SSR issues
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';

// Lazy-loaded PDF.js library (only loaded when needed, client-side only)
let pdfjsLib: typeof import('pdfjs-dist') | null = null;

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

  return Array.from(pages).sort((a, b) => a - b);
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
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 8;
  const baseStampText = formatStamp(stamp);
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;

  pages.forEach((page, idx) => {
    const stampText = `${baseStampText} | p.${idx + 1}/${totalPages}`;
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(stampText, fontSize);
    page.drawText(stampText, {
      x: width - textWidth - 40,
      y: height - 25,
      size: fontSize,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
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
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

  const pdfDoc = await PDFDocument.create();

  // Track page ranges per item for per-item stamp support
  const itemPageRanges: Array<{ startIdx: number; endIdx: number; itemStamp?: PrintStampInfo }> = [];

  for (const item of items) {
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
  }

  // Add stamp overlays — per-item stamp takes priority, then global stamp
  // Page numbering is continuous across items sharing the same stamp
  const hasAnyStamp = stamp || items.some(item => item.stamp);
  if (hasAnyStamp) {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 8;
    const allPages = pdfDoc.getPages();

    // Group by stamp identity for continuous page numbering
    const stampKey = (s: PrintStampInfo) => JSON.stringify(s);

    // Pre-compute total pages per stamp group
    const stampGroupTotals = new Map<string, number>();
    for (const range of itemPageRanges) {
      const effectiveStamp = range.itemStamp || stamp;
      if (!effectiveStamp) continue;
      const key = stampKey(effectiveStamp);
      stampGroupTotals.set(key, (stampGroupTotals.get(key) || 0) + (range.endIdx - range.startIdx));
    }

    // Running counter per stamp group
    const stampGroupCounters = new Map<string, number>();

    for (const range of itemPageRanges) {
      const effectiveStamp = range.itemStamp || stamp;
      if (!effectiveStamp) continue;

      const key = stampKey(effectiveStamp);
      const groupTotal = stampGroupTotals.get(key) || 0;
      const baseStampText = formatStamp(effectiveStamp);

      for (let i = range.startIdx; i < range.endIdx; i++) {
        const counter = (stampGroupCounters.get(key) || 0) + 1;
        stampGroupCounters.set(key, counter);
        const stampText = `${baseStampText} | p.${counter}/${groupTotal}`;
        const textWidth = font.widthOfTextAtSize(stampText, fontSize);
        const page = allPages[i];
        const { width, height } = page.getSize();
        page.drawText(stampText, {
          x: width - textWidth - 40,
          y: height - 25,
          size: fontSize,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
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
