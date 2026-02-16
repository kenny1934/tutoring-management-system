import katex from "katex";

/** Unescape HTML entities that bleach encodes in data attributes. */
function unescapeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

/**
 * Normalize MathLive's \displaylines{a}{b} to KaTeX-compatible \displaylines{a \\ b}.
 * MathLive's "add row" menu produces multiple brace groups; KaTeX expects a single group
 * with \\ separators. Uses brace-depth counting to handle nested braces correctly.
 */
function normalizeDisplaylines(latex: string): string {
  const prefix = "\\displaylines";
  let idx = latex.indexOf(prefix);
  while (idx !== -1) {
    let pos = idx + prefix.length;
    // Skip whitespace
    while (pos < latex.length && latex[pos] === " ") pos++;
    if (pos >= latex.length || latex[pos] !== "{") {
      idx = latex.indexOf(prefix, pos);
      continue;
    }
    // Collect consecutive top-level brace groups
    const groups: string[] = [];
    while (pos < latex.length && latex[pos] === "{") {
      let depth = 0;
      const start = pos;
      for (let i = pos; i < latex.length; i++) {
        if (latex[i] === "{") depth++;
        else if (latex[i] === "}") depth--;
        if (depth === 0) {
          groups.push(latex.substring(start + 1, i));
          pos = i + 1;
          break;
        }
      }
      if (depth !== 0) break; // unmatched brace — bail
    }
    if (groups.length > 1) {
      const merged = `${prefix}{${groups.join(" \\\\ ")}}`;
      latex = latex.substring(0, idx) + merged + latex.substring(pos);
      idx = latex.indexOf(prefix, idx + merged.length);
    } else {
      idx = latex.indexOf(prefix, pos);
    }
  }
  return latex;
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
        return katex.renderToString(normalizeDisplaylines(unescapeHtmlEntities(latexMatch[1])), { throwOnError: false, displayMode: false });
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
        return `<div class="block-math-rendered">${katex.renderToString(normalizeDisplaylines(unescapeHtmlEntities(latexMatch[1])), { throwOnError: false, displayMode: true })}</div>`;
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

/**
 * Highlight search term matches in visible text nodes only.
 * Uses a DOM TreeWalker to skip HTML attributes, KaTeX internals,
 * geometry data attributes, and syntax highlighting class names.
 */
export function highlightTextNodes(html: string, searchTerm: string): string {
  if (!searchTerm) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");

  // Skip elements whose text content is structural (not user-visible prose)
  const SKIP_TAGS = new Set(["STYLE", "SCRIPT", "SVG", "MATH"]);
  const SKIP_CLASSES = new Set(["katex-html", "katex-mathml"]);

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let el = node.parentElement;
      while (el && el !== doc.body) {
        if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        if (el.classList && (SKIP_CLASSES.has(el.classList[0]))) return NodeFilter.FILTER_REJECT;
        // Skip geometry data-attribute holders (their text is JSON, not visible)
        if (el.hasAttribute("data-graph-json")) return NodeFilter.FILTER_REJECT;
        el = el.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  for (const textNode of textNodes) {
    const text = textNode.textContent || "";
    if (!regex.test(text)) continue;
    regex.lastIndex = 0; // reset after .test()

    const frag = doc.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        frag.appendChild(doc.createTextNode(text.slice(lastIndex, match.index)));
      }
      const mark = doc.createElement("mark");
      mark.className = "bg-yellow-200 dark:bg-yellow-700/50 rounded-sm px-0.5";
      mark.textContent = match[1];
      frag.appendChild(mark);
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      frag.appendChild(doc.createTextNode(text.slice(lastIndex)));
    }
    textNode.parentNode!.replaceChild(frag, textNode);
  }

  return doc.body.innerHTML;
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
