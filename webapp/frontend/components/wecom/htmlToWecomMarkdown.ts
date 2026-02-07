/**
 * Converts Tiptap HTML output to WeCom webhook markdown format.
 *
 * WeCom markdown supports: headings, bold, italic, links, blockquotes,
 * inline code, and <font color="info|comment|warning"> color tags.
 */

const COLOR_TO_WECOM: Record<string, string> = {
  "#00b050": "info",
  "rgb(0, 176, 80)": "info",
  "#888888": "comment",
  "rgb(136, 136, 136)": "comment",
  "#ff6600": "warning",
  "rgb(255, 102, 0)": "warning",
};

function getWecomColor(style: string | null): string | null {
  if (!style) return null;
  const match = style.match(/color:\s*([^;]+)/);
  if (!match) return null;
  const color = match[1].trim().toLowerCase();
  return COLOR_TO_WECOM[color] ?? null;
}

function processNode(node: Node): string {
  // Text node
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map(processNode).join("");

  switch (tag) {
    case "strong":
    case "b":
      return `**${children}**`;

    case "em":
    case "i":
      return `*${children}*`;

    case "code":
      return `\`${children}\``;

    case "a": {
      const href = el.getAttribute("href") || "";
      return `[${children}](${href})`;
    }

    case "h1":
      return `# ${children}\n`;
    case "h2":
      return `## ${children}\n`;
    case "h3":
      return `### ${children}\n`;
    case "h4":
      return `#### ${children}\n`;
    case "h5":
      return `##### ${children}\n`;
    case "h6":
      return `###### ${children}\n`;

    case "blockquote":
      return children
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => `> ${line}`)
        .join("\n") + "\n";

    case "p":
      return children + "\n";

    case "br":
      return "\n";

    case "span":
    case "mark": {
      const wecomColor = getWecomColor(el.getAttribute("style"));
      if (wecomColor) {
        return `<font color="${wecomColor}">${children}</font>`;
      }
      return children;
    }

    // Lists — WeCom doesn't support list syntax, flatten to plain text
    case "ul":
    case "ol":
      return children;
    case "li":
      return `- ${children}\n`;

    // Container elements — just pass through children
    case "div":
    case "section":
    case "article":
      return children;

    default:
      return children;
  }
}

export function htmlToWecomMarkdown(html: string): string {
  if (!html || html === "<p></p>") return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const result = processNode(doc.body);

  // Clean up: trim trailing newlines, collapse multiple blank lines
  return result.replace(/\n{3,}/g, "\n\n").trim();
}
