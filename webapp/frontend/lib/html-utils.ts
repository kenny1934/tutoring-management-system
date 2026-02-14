import katex from "katex";

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
        return katex.renderToString(latexMatch[1], { throwOnError: false, displayMode: false });
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
        return `<div style="text-align:center;padding:8px 0;margin:4px 0">${katex.renderToString(latexMatch[1], { throwOnError: false, displayMode: true })}</div>`;
      } catch { return latexMatch[1]; }
    }
  );
  return html;
}

/** Check if an HTML string is effectively empty (no visible text content). */
export function isHtmlEmpty(html: string | undefined | null): boolean {
  if (!html || html === "<p></p>") return true;
  // Math nodes count as content even though they have no visible text
  if (/data-type="(inline|block)-math"/.test(html)) return false;
  return stripHtml(html).length === 0;
}
