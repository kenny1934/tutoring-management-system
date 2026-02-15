import katex from "katex";

/** Unescape HTML entities that bleach encodes in data attributes. */
function unescapeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

/** Strip HTML tags from a string and trim whitespace. */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/** Render KaTeX math nodes (inline & block) in an HTML string. */
export function renderMathInHtml(html: string): string {
  // Replace inline math spans with KaTeX-rendered HTML
  html = html.replace(
    /<span[^>]*data-type="inline-math"[^>]*>.*?<\/span>/gs,
    (match) => {
      const latexMatch = match.match(/data-latex="([^"]*)"/);
      if (!latexMatch) return match;
      try {
        return katex.renderToString(unescapeHtmlEntities(latexMatch[1]), { throwOnError: false, displayMode: false });
      } catch { return latexMatch[1]; }
    }
  );
  // Replace block math divs with KaTeX-rendered HTML
  html = html.replace(
    /<div[^>]*data-type="block-math"[^>]*>.*?<\/div>/gs,
    (match) => {
      const latexMatch = match.match(/data-latex="([^"]*)"/);
      if (!latexMatch) return match;
      try {
        return `<div style="text-align:center;padding:8px 0;margin:4px 0">${katex.renderToString(unescapeHtmlEntities(latexMatch[1]), { throwOnError: false, displayMode: true })}</div>`;
      } catch { return latexMatch[1]; }
    }
  );
  return html;
}

/** Replace geometry diagram divs with clickable SVG thumbnails. */
export function renderGeometryInHtml(html: string): string {
  return html.replace(
    /<div[^>]*data-type="geometry-diagram"[^>]*>.*?<\/div>/gs,
    (match) => {
      const thumbMatch = match.match(/data-svg-thumbnail="([^"]*)"/);
      const jsonMatch = match.match(/data-graph-json="([^"]*)"/);
      const thumb = thumbMatch?.[1] || "";
      const json = jsonMatch?.[1] || "";
      if (thumb && thumb.startsWith("data:image/svg+xml;base64,")) {
        return `<div data-type="geometry-diagram" data-graph-json="${json}" style="cursor:pointer;text-align:center;padding:8px 0;margin:4px 0"><img src="${thumb}" alt="Geometry diagram" style="max-width:100%;border-radius:8px;border:1px solid #e8d4b8" /></div>`;
      }
      return `<div data-type="geometry-diagram" data-graph-json="${json}" style="cursor:pointer;text-align:center;padding:8px 0;margin:4px 0;color:#999;font-size:12px">[Geometry Diagram]</div>`;
    }
  );
}

/** Check if an HTML string is effectively empty (no visible text content). */
export function isHtmlEmpty(html: string | undefined | null): boolean {
  if (!html || html === "<p></p>") return true;
  // Math nodes count as content even though they have no visible text
  if (/data-type="(inline|block)-math"/.test(html)) return false;
  // Geometry diagrams count as content
  if (/data-type="geometry-diagram"/.test(html)) return false;
  return stripHtml(html).length === 0;
}
