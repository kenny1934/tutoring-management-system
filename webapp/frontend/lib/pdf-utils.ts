/**
 * PDF utilities for page parsing and extraction using PDF.js
 * Note: PDF.js functions use dynamic imports to avoid SSR issues
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';

// Lazy-loaded PDF.js library (only loaded when needed, client-side only)
let pdfjsLib: typeof import('pdfjs-dist') | null = null;

async function getPdfJs() {
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
 * Extract specific pages from a PDF and return as a new Blob
 *
 * Note: PDF.js doesn't natively support creating new PDFs with only specific pages.
 * For true page extraction, we would need pdf-lib or similar.
 * This implementation returns the full PDF but can be used for page-aware display.
 *
 * For printing specific pages, we'll use a different approach - rendering to canvas.
 *
 * @param pdfData - Original PDF data as ArrayBuffer
 * @param pageNumbers - Array of page numbers to extract (1-indexed)
 * @param stamp - Optional stamp info to display on each page
 * @returns Blob containing the extracted pages as images in a printable format
 */
export async function extractPagesForPrint(
  pdfData: ArrayBuffer,
  pageNumbers: number[],
  stamp?: PrintStampInfo
): Promise<Blob> {
  const pdfjs = await getPdfJs();
  const pdf = await pdfjs.getDocument({ data: pdfData }).promise;

  try {
    // Create a container for all pages as images
    const pageImages: string[] = [];
    const scale = 4; // High resolution for print quality (4x = ~300 DPI for typical PDF)

    for (const pageNum of pageNumbers) {
      if (pageNum < 1 || pageNum > pdf.numPages) continue;

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      // Create canvas for rendering
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Failed to get canvas context');
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (page.render as any)({
        canvasContext: context,
        viewport,
      }).promise;

      // Convert to data URL
      const imageData = canvas.toDataURL('image/png');
      pageImages.push(imageData);
    }

    // Format stamp text if provided
    const stampText = stamp ? formatStamp(stamp) : '';
    const stampHtml = stampText
      ? `<div class="stamp">${stampText}</div>`
      : '';

    // Create an HTML document with all pages as images for printing
    // Use page-break-before on pages after the first to avoid trailing blank page
    const htmlContent = `<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
@page{margin:0}
html,body{margin:0;padding:0}
.page{height:100vh;display:flex;align-items:center;justify-content:center;position:relative}
.page+.page{page-break-before:always;break-before:page}
.page img{max-width:100%;max-height:100vh;object-fit:contain}
.stamp{position:absolute;top:25px;right:40px;font-size:9px;font-family:Arial,sans-serif;color:#333;background:rgba(255,255,255,0.9);padding:2px 6px;border-radius:2px;white-space:nowrap}
</style></head><body>${pageImages.map(src => `<div class="page"><img src="${src}">${stampHtml}</div>`).join('')}</body></html>`;

    return new Blob([htmlContent], { type: 'text/html' });
  } finally {
    await pdf.destroy();
  }
}

/**
 * Item for bulk printing - contains PDF data and page selection
 */
export interface BulkPrintItem {
  pdfData: ArrayBuffer;
  pageNumbers: number[];
  label?: string;  // Optional label for the document
}

/**
 * Extract pages from multiple PDFs and combine into a single printable HTML blob.
 * Each PDF's pages are rendered with the optional stamp.
 *
 * @param items - Array of PDF items with their page selections
 * @param stamp - Optional stamp info to display on each page
 * @returns Blob containing all pages as images in a printable format
 */
export async function extractBulkPagesForPrint(
  items: BulkPrintItem[],
  stamp?: PrintStampInfo
): Promise<Blob> {
  const pdfjs = await getPdfJs();
  const scale = 4; // High resolution for print quality
  const allPageImages: string[] = [];

  // Format stamp text if provided
  const stampText = stamp ? formatStamp(stamp) : '';
  const stampHtml = stampText
    ? `<div class="stamp">${stampText}</div>`
    : '';

  for (const item of items) {
    const pdf = await pdfjs.getDocument({ data: item.pdfData }).promise;

    try {
      // If pageNumbers is empty, use all pages
      const pagesToRender = item.pageNumbers.length > 0
        ? item.pageNumbers
        : Array.from({ length: pdf.numPages }, (_, i) => i + 1);

      for (const pageNum of pagesToRender) {
        if (pageNum < 1 || pageNum > pdf.numPages) continue;

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        // Create canvas for rendering
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');

        if (!context) {
          throw new Error('Failed to get canvas context');
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (page.render as any)({
          canvasContext: context,
          viewport,
        }).promise;

        // Convert to data URL
        const imageData = canvas.toDataURL('image/png');
        allPageImages.push(imageData);
      }
    } finally {
      await pdf.destroy();
    }
  }

  // Create an HTML document with all pages as images for printing
  const htmlContent = `<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
@page{margin:0}
html,body{margin:0;padding:0}
.page{height:100vh;display:flex;align-items:center;justify-content:center;position:relative}
.page+.page{page-break-before:always;break-before:page}
.page img{max-width:100%;max-height:100vh;object-fit:contain}
.stamp{position:absolute;top:25px;right:40px;font-size:9px;font-family:Arial,sans-serif;color:#333;background:rgba(255,255,255,0.9);padding:2px 6px;border-radius:2px;white-space:nowrap}
</style></head><body>${allPageImages.map(src => `<div class="page"><img src="${src}">${stampHtml}</div>`).join('')}</body></html>`;

  return new Blob([htmlContent], { type: 'text/html' });
}

/**
 * Extract and combine pages from multiple PDFs into a single PDF file for download.
 * Unlike extractBulkPagesForPrint which creates HTML, this creates an actual PDF.
 *
 * @param items - Array of PDFs with their page ranges
 * @param stamp - Optional stamp info (currently not implemented for PDF output)
 * @returns Blob containing the combined PDF
 */
export async function extractBulkPagesForDownload(
  items: BulkPrintItem[],
  stamp?: PrintStampInfo
): Promise<Blob> {
  // Dynamically import pdf-lib to avoid bundling issues
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

  const pdfDoc = await PDFDocument.create();

  for (const item of items) {
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
  }

  // Add stamp overlay to each page if provided
  if (stamp) {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 8;
    const stampText = formatStamp(stamp);
    const pages = pdfDoc.getPages();

    for (const page of pages) {
      const { width, height } = page.getSize();
      const textWidth = font.widthOfTextAtSize(stampText, fontSize);

      // Draw stamp in top-right corner (with margin for print safety)
      page.drawText(stampText, {
        x: width - textWidth - 40,  // 40px from right
        y: height - 25,              // 25px from top
        size: fontSize,
        font,
        color: rgb(0.2, 0.2, 0.2),  // Dark gray
      });
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
