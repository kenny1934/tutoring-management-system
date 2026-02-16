import hljs from "highlight.js/lib/common";

/**
 * Process HTML to add syntax highlighting to code blocks.
 * TipTap's CodeBlockLowlight uses ProseMirror decorations (visual only),
 * so getHTML() outputs bare <pre><code> without highlight spans.
 * This function runs highlight.js on the client side when rendering messages.
 */
export function highlightCodeBlocks(html: string): string {
  if (!html.includes("<pre>")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("pre code").forEach((el) => {
    const lang = el.className?.match(/language-(\w+)/)?.[1];
    const code = el.textContent || "";
    if (!code.trim()) return;
    try {
      const result = lang
        ? hljs.highlight(code, { language: lang })
        : hljs.highlightAuto(code);
      el.innerHTML = result.value;
    } catch {
      /* ignore unknown languages */
    }
  });
  return doc.body.innerHTML;
}
