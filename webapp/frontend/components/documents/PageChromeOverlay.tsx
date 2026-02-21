import type { DocumentMetadata } from "@/types";
import type { PageChromePosition } from "@/lib/tiptap-extensions/pagination-utils";
import { PAGE_GAP_PX } from "@/lib/tiptap-extensions/pagination-utils";
import { PageHeader } from "./PageHeader";
import { PageFooter } from "./PageFooter";

interface PageChromeOverlayProps {
  chromePositions: PageChromePosition[];
  totalPages: number;
  metadata: DocumentMetadata | null;
  docTitle: string;
}

/**
 * Renders page chrome (headers, footers, gaps, watermarks) as absolutely-positioned
 * React components overlaid on the editor content.
 *
 * This replaces Widget Decoration-based DOM innerHTML cloning with real React components
 * for all intermediate pages. First-page header and last-page footer are still rendered
 * in the normal document flow by DocumentEditor.
 */
export function PageChromeOverlay({
  chromePositions,
  totalPages,
  metadata,
  docTitle,
}: PageChromeOverlayProps) {
  if (chromePositions.length === 0) return null;

  const marginLeftMm = metadata?.margins?.left ?? 25.4;
  const marginRightMm = metadata?.margins?.right ?? 25.4;

  return (
    <div
      className="page-chrome-overlay"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      {chromePositions.map((chrome) => (
        <div key={chrome.pageNumber}>
          {/* Footer for this page */}
          <div
            style={{
              position: "absolute",
              top: `${chrome.footerTopPx}px`,
              left: `${marginLeftMm}mm`,
              right: `${marginRightMm}mm`,
            }}
          >
            <PageFooter
              section={metadata?.footer}
              docTitle={docTitle}
              pageNumber={chrome.pageNumber}
              totalPages={totalPages}
            />
          </div>

          {/* Page gap (visual divider between pages) */}
          <div
            className="page-gap"
            style={{
              position: "absolute",
              top: `${chrome.gapTopPx}px`,
              left: 0,
              right: 0,
              height: `${PAGE_GAP_PX}px`,
            }}
          />

          {/* Header for the next page */}
          {chrome.pageNumber < totalPages && (
            <div
              style={{
                position: "absolute",
                top: `${chrome.headerTopPx}px`,
                left: `${marginLeftMm}mm`,
                right: `${marginRightMm}mm`,
              }}
            >
              <PageHeader
                section={metadata?.header}
                docTitle={docTitle}
                pageNumber={chrome.pageNumber + 1}
                totalPages={totalPages}
              />
            </div>
          )}

          {/* Watermarks rendered outside overlay in DocumentEditor to avoid stacking context */}
        </div>
      ))}
    </div>
  );
}
