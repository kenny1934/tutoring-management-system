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
 * Adds `pagination-measuring` class to hide existing decorations during measurement.
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
    // When a decoration widget sits between blocks, it prevents margin collapse,
    // so the trailing margin becomes real space we must account for in the spacer.
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
 * Returns break positions with spacer heights and page numbers.
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
  // Subtract 5px safety margin to absorb sub-pixel differences between
  // decoration and React header/footer rendering, plus collapsed margin gaps
  // on page 1. Even 0.1px overflow causes Chrome to auto-break before footer.
  const contentAreaPx = totalPageHeightPx - marginTopPx - marginBottomPx - headerHeightPx - footerHeightPx - 5;

  if (contentAreaPx <= 0) return { breaks: [], lastPageRemainingPx: 0, contentAreaPx: 0 };

  const breaks: PageBreakInfo[] = [];
  let accumulated = 0;
  let currentPage = 1;
  // Track trailing margin of the last content block on each page.
  // During measurement, decorations are hidden so adjacent block margins collapse.
  // But in actual layout (and print), the decoration widget sits between blocks,
  // preventing collapse — the last block's margin-bottom becomes real space
  // that must be subtracted from the spacer.
  let lastBlockMarginBottom = 0;

  for (const block of blocks) {
    if (block.isPageBreak) {
      breaks.push({
        pos: block.pos + block.nodeSize,
        remainingPx: contentAreaPx - accumulated - lastBlockMarginBottom,
        pageNumber: currentPage,
        isExplicitBreak: true,
        nodeSize: block.nodeSize,
      });
      accumulated = 0;
      lastBlockMarginBottom = 0;
      currentPage++;
      continue;
    }

    if (block.height === 0) continue;

    if (accumulated + block.height > contentAreaPx && accumulated > 0) {
      breaks.push({
        pos: block.pos,
        remainingPx: contentAreaPx - accumulated - lastBlockMarginBottom,
        pageNumber: currentPage,
      });
      accumulated = block.height;
      lastBlockMarginBottom = block.marginBottom;
      currentPage++;
    } else {
      accumulated += block.height;
      lastBlockMarginBottom = block.marginBottom;
    }
  }

  return {
    breaks,
    lastPageRemainingPx: Math.max(0, contentAreaPx - accumulated - lastBlockMarginBottom),
    contentAreaPx,
  };
}

// ─── Decoration DOM creation ────────────────────────────────────────

export interface DecorationDOMConfig {
  remainingPx: number;
  pageNumber: number;
  nextPageNumber: number;
  docTitle: string;
  metadata: DocumentMetadata | null;
  /** If true, skip the break-trigger div (the explicit pageBreak node handles it) */
  isExplicitBreak?: boolean;
}

function createHFContent(
  section: DocumentHeaderFooter | undefined,
  docTitle: string,
  pageNumber: number,
): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = "display:flex;justify-content:space-between;align-items:center;font-size:9px;line-height:normal;color:#888;pointer-events:none;user-select:none;";

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

    // Text content with resolved {page}
    if (texts[i]) {
      const resolved = resolvePageNumber(resolveTemplate(texts[i], docTitle), pageNumber);
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

/**
 * Create the full DOM element for a page-break Widget Decoration.
 *
 * Structure:
 *   <div.page-break-decoration contenteditable="false">
 *     <div.page-bottom-spacer style="height:{remaining}px">
 *     <div.page-footer-content>  (footer of ending page)
 *     <div.page-break-trigger style="break-after:page;height:0">
 *     <div.page-gap print:hidden> (gray gap between pages in editor)
 *     <div.page-header-content>  (header of starting page)
 *   </div>
 */
export function createPageBreakElement(config: DecorationDOMConfig): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "page-break-decoration not-prose";
  wrapper.contentEditable = "false";

  // 1. Bottom spacer — fills remaining space to push footer to page bottom
  const spacer = document.createElement("div");
  spacer.className = "page-bottom-spacer";
  spacer.style.height = `${Math.max(0, config.remainingPx)}px`;
  wrapper.appendChild(spacer);

  // 2. Footer of current (ending) page — only styled when footer section is enabled
  const footer = document.createElement("div");
  footer.className = "page-footer-content";
  if (config.metadata?.footer?.enabled) {
    footer.style.cssText = "padding-top:4px;border-top:0.5px solid #ddd;font-size:9px;line-height:normal;";
    const footerContent = createHFContent(config.metadata.footer, config.docTitle, config.pageNumber);
    footer.appendChild(footerContent);
  }
  wrapper.appendChild(footer);

  // 3. Page break trigger — Chrome breaks HERE (skipped for explicit pageBreak nodes)
  if (!config.isExplicitBreak) {
    const trigger = document.createElement("div");
    trigger.className = "page-break-trigger";
    trigger.style.cssText = "break-after:page;height:0;overflow:hidden;";
    wrapper.appendChild(trigger);
  }

  // 4. Gray gap between pages (hidden in print)
  const gap = document.createElement("div");
  gap.className = "page-gap";
  gap.style.cssText = `height:${PAGE_GAP_PX}px;background:#d1c8bc;`;
  wrapper.appendChild(gap);

  // 5. Header of next page — only styled when header section is enabled
  const header = document.createElement("div");
  header.className = "page-header-content";
  if (config.metadata?.header?.enabled) {
    header.style.cssText = "padding-bottom:4px;border-bottom:0.5px solid #ddd;margin-bottom:9px;font-size:9px;line-height:normal;";
    const headerContent = createHFContent(config.metadata.header, config.docTitle, config.nextPageNumber);
    header.appendChild(headerContent);
  }
  wrapper.appendChild(header);

  // Watermark: NOT rendered in decorations. First-page watermark is React JSX,
  // and position:fixed CSS repeats it on every printed page. Decorations can't
  // accurately center a watermark per-page since the wrapper height != page height.

  return wrapper;
}

// ─── Header/Footer height estimation ────────────────────────────────

/** Estimate the pixel height of a header or footer section (used for layout calculation). */
export function estimateHFHeightPx(section?: DocumentHeaderFooter): number {
  if (!section?.enabled) return 0;
  const hasImage = !!section.imageUrl;
  const hasText = !!(section.left || section.center || section.right);
  if (!hasImage && !hasText) return 0;
  // ~14px for text line, or 10mm for image, plus ~8px padding/border
  // marginBottom "1em" at font-size 9px = 9px
  const lineHeight = hasImage ? convertMmToPx(10) : 14;
  return lineHeight + 8 + 9;
}

// ─── Export constants for use in the extension ──────────────────────
export { A4_HEIGHT_MM, A4_WIDTH_MM, PAGE_GAP_PX };
