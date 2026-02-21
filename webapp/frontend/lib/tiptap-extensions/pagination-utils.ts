import type { EditorView } from "@tiptap/pm/view";
import type { DocumentMetadata, DocumentHeaderFooter } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────
const A4_HEIGHT_MM = 297;
const A4_WIDTH_MM = 210;

// Height of the gap between pages in the editor (hidden in print)
const PAGE_GAP_PX = 40;

// ─── mm ↔ px conversion ─────────────────────────────────────────────
let _pxPerMm: number | null = null;

export function convertMmToPx(mm: number): number {
  if (_pxPerMm === null) {
    const probe = document.createElement("div");
    probe.style.width = "100mm";
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    _pxPerMm = probe.getBoundingClientRect().width / 100;
    document.body.removeChild(probe);
  }
  return mm * _pxPerMm;
}

export function resetPxPerMm(): void {
  _pxPerMm = null;
}

// ─── Header / Footer rendering ──────────────────────────────────────

/** Build a composite CSS font-family string from separate Latin and CJK font selections.
 *  Latin font is tried first (matches Latin characters), CJK font is fallback (matches CJK characters). */
export function buildHFontFamily(fontFamily?: string | null, fontFamilyCjk?: string | null): string | undefined {
  if (!fontFamily && !fontFamilyCjk) return undefined;
  const generics = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"]);
  const strip = (ff: string) => ff.split(",").map(s => s.trim()).filter(s => !generics.has(s)).join(", ");
  const parts: string[] = [];
  if (fontFamily) parts.push(strip(fontFamily));
  if (fontFamilyCjk) parts.push(strip(fontFamilyCjk));
  parts.push("sans-serif");
  return parts.join(", ");
}

/** Resolve template variables like {title}, {date} — NOT {page}, which is resolved per-decoration. */
export function resolveTemplate(template: string, docTitle: string): string {
  if (!template) return "";
  return template
    .replace(/\{title\}/g, docTitle)
    .replace(/\{date\}/g, new Date().toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    }));
}

/** Resolve {page} with a specific page number (static text — no CSS counters needed). */
export function resolvePageNumber(text: string, pageNumber: number): string {
  return text.replace(/\{page\}/g, String(pageNumber));
}

/** Resolve {total} with total page count. */
export function resolveTotal(text: string, totalPages: number): string {
  return text.replace(/\{total\}/g, String(totalPages));
}

/** Resolve all template variables including {page} and {total} in one call. */
export function resolveText(template: string, docTitle: string, pageNumber: number, totalPages?: number): string {
  let result = resolvePageNumber(resolveTemplate(template, docTitle), pageNumber);
  if (totalPages != null) result = resolveTotal(result, totalPages);
  return result;
}

// ─── Measurement ────────────────────────────────────────────────────

export interface BlockMeasurement {
  /** Position in the ProseMirror document where this block starts */
  pos: number;
  /** Total height of this block in pixels */
  height: number;
  /** Whether this block is an explicit pageBreak node */
  isPageBreak: boolean;
  /** Size of the node in ProseMirror (used for placing decorations after explicit breaks) */
  nodeSize: number;
  /** Trailing margin-bottom (not included in height via getBoundingClientRect) */
  marginBottom: number;
}

/**
 * Measure top-level block heights in the editor.
 * Adds `pagination-measuring` class to temporarily zero out Node Decoration
 * padding during measurement (CSS rule `.pagination-measuring .page-end`
 * overrides padding-bottom to 0).
 */
export function measureNodeHeights(view: EditorView): BlockMeasurement[] {
  const editorDom = view.dom;
  editorDom.classList.add("pagination-measuring");

  const measurements: BlockMeasurement[] = [];
  const doc = view.state.doc;

  // Use cumulative positioning to account for margin collapse between adjacent blocks.
  // Instead of summing individual block heights (which double-counts collapsed margins),
  // we measure the gap from the editor top to each block's bottom edge.
  const editorRect = editorDom.getBoundingClientRect();
  let prevBottom = editorRect.top;

  doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset);
    if (!dom || !(dom instanceof HTMLElement)) {
      measurements.push({
        pos: offset,
        height: 0,
        isPageBreak: node.type.name === "pageBreak",
        nodeSize: node.nodeSize,
        marginBottom: 0,
      });
      return;
    }

    const rect = dom.getBoundingClientRect();
    // Height = distance from previous block's bottom to this block's bottom.
    // This correctly handles margin collapse because the browser already collapsed
    // margins in the layout — we're measuring actual rendered positions.
    const height = rect.bottom - prevBottom;
    // Capture margin-bottom: getBoundingClientRect() returns border-box (excludes margin).
    const marginBottom = parseFloat(window.getComputedStyle(dom).marginBottom) || 0;

    measurements.push({
      pos: offset,
      height: Math.max(0, height),
      isPageBreak: node.type.name === "pageBreak",
      nodeSize: node.nodeSize,
      marginBottom,
    });

    prevBottom = rect.bottom;
  });

  editorDom.classList.remove("pagination-measuring");
  return measurements;
}

// ─── Break position calculation ─────────────────────────────────────

export interface PageBreakInfo {
  /** ProseMirror position where the decoration should be inserted */
  pos: number;
  /** Remaining space on the current page (for the bottom spacer) */
  remainingPx: number;
  /** The page number that ENDS at this break (footer shows this number) */
  pageNumber: number;
  /** Whether this break was caused by an explicit pageBreak node (decoration placed after node, no break-trigger needed) */
  isExplicitBreak?: boolean;
  /** Size of the explicit pageBreak node (used to place decoration after it) */
  nodeSize?: number;
  /** Start position of the node that receives the page-end Node Decoration (padding-bottom) */
  decoFrom: number;
  /** End position of the node that receives the page-end Node Decoration */
  decoTo: number;
}

export interface PaginationConfig {
  margins: { top: number; right: number; bottom: number; left: number };
  headerHeightPx: number;
  footerHeightPx: number;
}

export interface PaginationResult {
  breaks: PageBreakInfo[];
  /** Remaining space on the last page (for last-page footer spacer) */
  lastPageRemainingPx: number;
  /** Content area height per page in pixels */
  contentAreaPx: number;
}

/**
 * Calculate page break positions from block measurements.
 * Returns break positions with spacer heights, page numbers, and
 * Node Decoration targets (decoFrom/decoTo).
 */
export function calculateBreakPositions(
  blocks: BlockMeasurement[],
  config: PaginationConfig,
): PaginationResult {
  const { margins, headerHeightPx, footerHeightPx } = config;

  const totalPageHeightPx = convertMmToPx(A4_HEIGHT_MM);
  const marginTopPx = convertMmToPx(margins.top);
  const marginBottomPx = convertMmToPx(margins.bottom);

  // Content area = page height - margins - header - footer
  // Subtract 5px safety margin to absorb sub-pixel differences
  const contentAreaPx = totalPageHeightPx - marginTopPx - marginBottomPx - headerHeightPx - footerHeightPx - 5;

  if (contentAreaPx <= 0) return { breaks: [], lastPageRemainingPx: 0, contentAreaPx: 0 };

  const breaks: PageBreakInfo[] = [];
  let accumulated = 0;
  let currentPage = 1;
  let lastBlockMarginBottom = 0;
  // Track the last content block on the current page for Node Decoration targeting
  let lastContentBlock: BlockMeasurement | null = null;

  for (const block of blocks) {
    if (block.isPageBreak) {
      // Explicit break: the pageBreak node itself receives the padding-bottom
      breaks.push({
        pos: block.pos + block.nodeSize,
        remainingPx: contentAreaPx - accumulated - lastBlockMarginBottom,
        pageNumber: currentPage,
        isExplicitBreak: true,
        nodeSize: block.nodeSize,
        decoFrom: block.pos,
        decoTo: block.pos + block.nodeSize,
      });
      accumulated = 0;
      lastBlockMarginBottom = 0;
      lastContentBlock = null;
      currentPage++;
      continue;
    }

    if (block.height === 0) continue;

    if (accumulated + block.height > contentAreaPx && accumulated > 0) {
      // Automatic break: last content block on the page receives the padding-bottom
      const target = lastContentBlock!;
      breaks.push({
        pos: block.pos,
        remainingPx: contentAreaPx - accumulated - lastBlockMarginBottom,
        pageNumber: currentPage,
        decoFrom: target.pos,
        decoTo: target.pos + target.nodeSize,
      });
      accumulated = block.height;
      lastBlockMarginBottom = block.marginBottom;
      lastContentBlock = block;
      currentPage++;
    } else {
      accumulated += block.height;
      lastBlockMarginBottom = block.marginBottom;
      lastContentBlock = block;
    }
  }

  const lastPageRemainingPx = Math.max(0, contentAreaPx - accumulated - lastBlockMarginBottom);
  return {
    breaks,
    lastPageRemainingPx,
    contentAreaPx,
  };
}

// ─── Chrome position calculation ─────────────────────────────────────

export interface PageChromePosition {
  pageNumber: number;
  /** Y offset for the footer of this page (relative to editor content top) */
  footerTopPx: number;
  /** Y offset for the page gap after this page */
  gapTopPx: number;
  /** Y offset for the header of the next page */
  headerTopPx: number;
  /** Y offset for the watermark center of the next page */
  watermarkCenterPx: number;
}

/**
 * Calculate Y-pixel positions for page chrome (headers, footers, gaps, watermarks)
 * relative to the editor content area top.
 *
 * These positions are consumed by the React PageChromeOverlay component to render
 * absolutely-positioned page chrome elements.
 *
 * The calculation is straightforward: each page takes exactly `contentAreaPx` of
 * content space (padding-bottom fills the remainder), followed by footer, margin,
 * gap, margin, and header. This creates a regular stride pattern.
 */
export function calculateChromePositions(
  breaks: PageBreakInfo[],
  config: PaginationConfig,
): PageChromePosition[] {
  if (breaks.length === 0) return [];

  const { margins, headerHeightPx, footerHeightPx } = config;
  const marginTopPx = convertMmToPx(margins.top);
  const marginBottomPx = convertMmToPx(margins.bottom);
  const contentAreaPx = convertMmToPx(A4_HEIGHT_MM) - marginTopPx - marginBottomPx - headerHeightPx - footerHeightPx - 5;

  if (contentAreaPx <= 0) return [];

  // Chrome height between pages: footer + bottom margin + gap + top margin + header
  const chromeH = footerHeightPx + marginBottomPx + PAGE_GAP_PX + marginTopPx + headerHeightPx;
  // Total stride per page: content area + chrome
  const pageStride = contentAreaPx + chromeH;

  return breaks.map((brk, i) => {
    // Offset: the first-page header is in normal flow above the editor content,
    // but the overlay is absolutely positioned from the .document-page content-box top.
    // All positions must be offset by the first-page header height.
    // Footer starts at the end of page (i+1)'s content area.
    // Footer of page N: headerH + N*contentAreaPx + (N-1)*chromeH
    const footerTopPx = marginTopPx + headerHeightPx + (i + 1) * contentAreaPx + i * chromeH;
    const gapTopPx = footerTopPx + footerHeightPx + marginBottomPx;
    const headerTopPx = gapTopPx + PAGE_GAP_PX + marginTopPx;
    const watermarkCenterPx = headerTopPx + headerHeightPx + contentAreaPx / 2;

    return {
      pageNumber: brk.pageNumber,
      footerTopPx,
      gapTopPx,
      headerTopPx,
      watermarkCenterPx,
    };
  });
}

/**
 * Calculate the total padding-bottom to apply to the last block on a page.
 * This padding creates space for: remaining content area + footer + bottom margin +
 * page gap + top margin + header of next page.
 */
export function calculatePageEndPadding(
  remainingPx: number,
  config: PaginationConfig,
): number {
  const { margins, headerHeightPx, footerHeightPx } = config;
  const marginTopPx = convertMmToPx(margins.top);
  const marginBottomPx = convertMmToPx(margins.bottom);
  return Math.max(0, remainingPx) + footerHeightPx + marginBottomPx + PAGE_GAP_PX + marginTopPx + headerHeightPx;
}

// ─── Print-only Widget Decoration DOM ────────────────────────────────

export interface PrintBreakConfig {
  pageNumber: number;
  nextPageNumber: number;
  totalPages: number;
  docTitle: string;
  metadata: DocumentMetadata | null;
  /** If true, skip the break-trigger div (the explicit pageBreak node handles it) */
  isExplicitBreak?: boolean;
}

/**
 * Create a minimal DOM element for print-only Widget Decorations.
 * These are hidden on screen (display:none) and shown only in print CSS.
 * Contains: footer of ending page, break-after:page trigger, header of next page.
 * No spacer, no gap, no watermark (those are handled by Node Decorations + React overlay on screen).
 */
export function createPrintPageBreak(config: PrintBreakConfig): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "print-page-break not-prose";
  wrapper.contentEditable = "false";

  // 1. Footer of current (ending) page
  const footer = document.createElement("div");
  footer.className = "page-footer-content";
  if (config.metadata?.footer?.enabled) {
    const fSize = config.metadata.footer.fontSize ?? 9;
    const fFont = buildHFontFamily(config.metadata.footer.fontFamily, config.metadata.footer.fontFamilyCjk);
    const fFontCss = fFont ? `font-family:${fFont};` : "";
    footer.style.cssText = `padding-top:4px;border-top:0.5px solid #ddd;font-size:${fSize}px;${fFontCss}line-height:normal;`;
    const footerContent = createHFContent(config.metadata.footer, config.docTitle, config.pageNumber, config.totalPages);
    footer.appendChild(footerContent);
  }
  wrapper.appendChild(footer);

  // 2. Page break trigger (skipped for explicit pageBreak nodes — they already have break-after:page)
  if (!config.isExplicitBreak) {
    const trigger = document.createElement("div");
    trigger.className = "page-break-trigger";
    trigger.style.cssText = "break-after:page;height:0;overflow:hidden;";
    wrapper.appendChild(trigger);
  }

  // 3. Header of next page
  const header = document.createElement("div");
  header.className = "page-header-content";
  if (config.metadata?.header?.enabled) {
    const hSize = config.metadata.header.fontSize ?? 9;
    const hFont = buildHFontFamily(config.metadata.header.fontFamily, config.metadata.header.fontFamilyCjk);
    const hFontCss = hFont ? `font-family:${hFont};` : "";
    header.style.cssText = `padding-bottom:4px;border-bottom:0.5px solid #ddd;margin-bottom:9px;font-size:${hSize}px;${hFontCss}line-height:normal;`;
    const headerContent = createHFContent(config.metadata.header, config.docTitle, config.nextPageNumber, config.totalPages);
    header.appendChild(headerContent);
  }
  wrapper.appendChild(header);

  return wrapper;
}

// ─── DOM helper for print header/footer content ─────────────────────

function createHFContent(
  section: DocumentHeaderFooter | undefined,
  docTitle: string,
  pageNumber: number,
  totalPages?: number,
): HTMLElement {
  const container = document.createElement("div");
  const fontSize = section?.fontSize ?? 9;
  const compositeFont = buildHFontFamily(section?.fontFamily, section?.fontFamilyCjk);
  const fontFamilyCss = compositeFont ? `font-family:${compositeFont};` : "";
  container.style.cssText = `display:flex;justify-content:space-between;align-items:center;font-size:${fontSize}px;${fontFamilyCss}line-height:normal;color:#888;pointer-events:none;user-select:none;`;

  if (!section?.enabled) return container;

  const positions = ["left", "center", "right"] as const;
  const texts = [section.left, section.center, section.right];

  positions.forEach((pos, i) => {
    const span = document.createElement("span");
    span.style.flex = "1";
    if (pos === "center") span.style.textAlign = "center";
    if (pos === "right") span.style.textAlign = "right";

    // Image
    if (section.imageUrl && section.imagePosition === pos) {
      const img = document.createElement("img");
      img.src = section.imageUrl;
      img.alt = "";
      img.style.cssText = "max-height:10mm;width:auto;display:inline-block;vertical-align:middle;margin-right:4px;";
      span.appendChild(img);
    }

    // Text content with resolved {page} and {total}
    if (texts[i]) {
      const resolved = resolveText(texts[i], docTitle, pageNumber, totalPages);
      const textNode = document.createTextNode(resolved);
      // If image is on the right, text comes first
      if (section.imageUrl && section.imagePosition === pos && pos === "right") {
        span.insertBefore(textNode, span.firstChild);
        // Adjust margin
        const img = span.querySelector("img");
        if (img) {
          img.style.marginRight = "0";
          img.style.marginLeft = "4px";
        }
      } else {
        span.appendChild(textNode);
      }
    }

    container.appendChild(span);
  });

  return container;
}

// ─── Header/Footer height estimation ────────────────────────────────

/** Estimate the pixel height of a header or footer section (used for layout calculation). */
export function estimateHFHeightPx(section?: DocumentHeaderFooter): number {
  if (!section?.enabled) return 0;
  const hasImage = !!section.imageUrl;
  const hasText = !!(section.left || section.center || section.right);
  if (!hasImage && !hasText) return 0;
  const fontSize = section.fontSize ?? 9;
  // ~1.5x font-size for text line, or 10mm for image, plus ~8px padding/border + 9px margin
  const lineHeight = hasImage ? convertMmToPx(10) : Math.ceil(fontSize * 1.5);
  return lineHeight + 8 + 9;
}

// ─── Export constants for use in the extension ──────────────────────
export { A4_HEIGHT_MM, A4_WIDTH_MM, PAGE_GAP_PX };
