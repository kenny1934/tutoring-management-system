/**
 * Extract plain text (with LaTeX) and HTML (with images) from TipTap JSON
 * for dual-format clipboard copy.
 */

interface TipTapNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

// ---------------------------------------------------------------------------
// Plain text extraction
// ---------------------------------------------------------------------------

interface PlainCtx {
  depth: number;
  listType: "bullet" | "ordered" | "task" | null;
  listCounter: number;
}

function plainInline(node: TipTapNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "inlineMath") {
    const latex = (node.attrs?.latex as string) ?? "";
    return latex ? `$${latex}$` : "";
  }
  if (node.type === "hardBreak") return "\n";
  // Recurse for unknown inline nodes
  return (node.content ?? []).map(plainInline).join("");
}

function plainBlock(node: TipTapNode, ctx: PlainCtx): string {
  const { depth } = ctx;
  const indent = "  ".repeat(depth);

  switch (node.type) {
    case "doc":
      return (node.content ?? []).map(c => plainBlock(c, ctx)).join("\n");

    case "paragraph":
    case "heading":
      return indent + (node.content ?? []).map(plainInline).join("");

    case "blockMath": {
      const latex = (node.attrs?.latex as string) ?? "";
      return latex ? `${indent}$$${latex}$$` : "";
    }

    case "bulletList":
      return (node.content ?? [])
        .map(c => plainBlock(c, { ...ctx, listType: "bullet", listCounter: 0 }))
        .join("\n");

    case "orderedList": {
      const start = (node.attrs?.start as number) ?? 1;
      let counter = start;
      return (node.content ?? [])
        .map(c => {
          const result = plainBlock(c, { ...ctx, listType: "ordered", listCounter: counter });
          counter++;
          return result;
        })
        .join("\n");
    }

    case "taskList":
      return (node.content ?? [])
        .map(c => plainBlock(c, { ...ctx, listType: "task", listCounter: 0 }))
        .join("\n");

    case "listItem": {
      const prefix =
        ctx.listType === "ordered" ? `${ctx.listCounter}. ` : "- ";
      const children = node.content ?? [];
      const parts: string[] = [];
      for (const child of children) {
        if (child.type === "bulletList" || child.type === "orderedList" || child.type === "taskList") {
          parts.push(plainBlock(child, { ...ctx, depth: depth + 1 }));
        } else {
          parts.push(indent + prefix + (child.content ?? []).map(plainInline).join(""));
        }
      }
      return parts.join("\n");
    }

    case "taskItem": {
      const checked = node.attrs?.checked ? "x" : " ";
      const prefix = `[${checked}] `;
      const children = node.content ?? [];
      const parts: string[] = [];
      for (const child of children) {
        if (child.type === "bulletList" || child.type === "orderedList" || child.type === "taskList") {
          parts.push(plainBlock(child, { ...ctx, depth: depth + 1 }));
        } else {
          parts.push(indent + prefix + (child.content ?? []).map(plainInline).join(""));
        }
      }
      return parts.join("\n");
    }

    case "blockquote":
      return (node.content ?? [])
        .map(c => indent + "> " + plainBlock(c, { ...ctx, depth: 0 }).trimStart())
        .join("\n");

    case "codeBlock": {
      const lang = (node.attrs?.language as string) ?? "";
      const code = (node.content ?? []).map(plainInline).join("");
      return `${indent}\`\`\`${lang}\n${code}\n${indent}\`\`\``;
    }

    case "table":
      return (node.content ?? []).map(c => plainBlock(c, ctx)).join("\n");

    case "tableRow":
      return indent + (node.content ?? [])
        .map(c => (c.content ?? []).map(child => plainBlock(child, { ...ctx, depth: 0 }).trim()).join(" "))
        .join("\t");

    case "tableCell":
    case "tableHeader":
      return (node.content ?? []).map(c => plainBlock(c, { ...ctx, depth: 0 })).join(" ");

    case "answerSection":
      return (node.content ?? []).map(c => plainBlock(c, ctx)).join("\n");

    case "geometryDiagram":
      return indent + "[Geometry Diagram]";

    case "pageBreak":
    case "horizontalRule":
      return indent + "---";

    case "image":
    case "resizableImage":
      return indent + "[Image]";

    default:
      // Unknown block: recurse
      if (node.content) {
        return node.content.map(c => plainBlock(c, ctx)).join("\n");
      }
      return "";
  }
}

export function extractPlainText(doc: TipTapNode): string {
  const raw = plainBlock(doc, { depth: 0, listType: null, listCounter: 0 });
  // Collapse 3+ consecutive newlines into 2
  return raw.replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------------------
// HTML extraction
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlInline(node: TipTapNode): string {
  if (node.type === "text") {
    let text = escapeHtml(node.text ?? "");
    // Apply marks
    for (const mark of node.marks ?? []) {
      switch (mark.type) {
        case "bold": text = `<b>${text}</b>`; break;
        case "italic": text = `<i>${text}</i>`; break;
        case "underline": text = `<u>${text}</u>`; break;
        case "strike": text = `<s>${text}</s>`; break;
        case "code": text = `<code>${text}</code>`; break;
        case "subscript": text = `<sub>${text}</sub>`; break;
        case "superscript": text = `<sup>${text}</sup>`; break;
        case "highlight": {
          const color = (mark.attrs?.color as string) ?? "yellow";
          text = `<mark style="background-color:${color}">${text}</mark>`;
          break;
        }
        case "link": {
          const href = escapeHtml((mark.attrs?.href as string) ?? "");
          text = `<a href="${href}">${text}</a>`;
          break;
        }
      }
    }
    return text;
  }
  if (node.type === "inlineMath") {
    const latex = (node.attrs?.latex as string) ?? "";
    return latex ? `$${escapeHtml(latex)}$` : "";
  }
  if (node.type === "hardBreak") return "<br>";
  return (node.content ?? []).map(htmlInline).join("");
}

function htmlBlock(node: TipTapNode): string {
  switch (node.type) {
    case "doc":
      return (node.content ?? []).map(htmlBlock).join("");

    case "paragraph":
      return `<p>${(node.content ?? []).map(htmlInline).join("")}</p>`;

    case "heading": {
      const level = (node.attrs?.level as number) ?? 1;
      const tag = `h${level}`;
      return `<${tag}>${(node.content ?? []).map(htmlInline).join("")}</${tag}>`;
    }

    case "blockMath": {
      const latex = (node.attrs?.latex as string) ?? "";
      return latex ? `<p>$$${escapeHtml(latex)}$$</p>` : "";
    }

    case "bulletList":
      return `<ul>${(node.content ?? []).map(htmlBlock).join("")}</ul>`;

    case "orderedList": {
      const start = (node.attrs?.start as number) ?? 1;
      const startAttr = start !== 1 ? ` start="${start}"` : "";
      return `<ol${startAttr}>${(node.content ?? []).map(htmlBlock).join("")}</ol>`;
    }

    case "taskList":
      return `<ul style="list-style:none;padding-left:0;">${(node.content ?? []).map(htmlBlock).join("")}</ul>`;

    case "listItem":
    case "taskItem": {
      let prefix = "";
      if (node.type === "taskItem") {
        const checked = node.attrs?.checked;
        prefix = checked ? "&#9745; " : "&#9744; ";
      }
      const inner = (node.content ?? []).map(c => {
        if (c.type === "bulletList" || c.type === "orderedList" || c.type === "taskList") {
          return htmlBlock(c);
        }
        return (c.content ?? []).map(htmlInline).join("");
      }).join("");
      return `<li>${prefix}${inner}</li>`;
    }

    case "blockquote":
      return `<blockquote>${(node.content ?? []).map(htmlBlock).join("")}</blockquote>`;

    case "codeBlock": {
      const code = (node.content ?? []).map(c => escapeHtml(c.text ?? "")).join("");
      return `<pre><code>${code}</code></pre>`;
    }

    case "table":
      return `<table border="1" cellpadding="4" cellspacing="0">${(node.content ?? []).map(htmlBlock).join("")}</table>`;

    case "tableRow":
      return `<tr>${(node.content ?? []).map(htmlBlock).join("")}</tr>`;

    case "tableCell":
      return `<td>${(node.content ?? []).map(htmlBlock).join("")}</td>`;

    case "tableHeader":
      return `<th>${(node.content ?? []).map(htmlBlock).join("")}</th>`;

    case "answerSection":
      return (node.content ?? []).map(htmlBlock).join("");

    case "geometryDiagram": {
      const svg = (node.attrs?.svgThumbnail as string) ?? "";
      if (!svg) return "<p>[Geometry Diagram]</p>";
      return `<p><img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" alt="Geometry Diagram" style="max-width:100%;"></p>`;
    }

    case "pageBreak":
    case "horizontalRule":
      return "<hr>";

    case "image":
    case "resizableImage": {
      const src = (node.attrs?.src as string) ?? "";
      const alt = escapeHtml((node.attrs?.alt as string) ?? "");
      const width = node.attrs?.width ? ` width="${node.attrs.width}"` : "";
      return `<p><img src="${escapeHtml(src)}" alt="${alt}"${width} style="max-width:100%;"></p>`;
    }

    default:
      if (node.content) {
        return node.content.map(htmlBlock).join("");
      }
      return "";
  }
}

export function extractHtml(doc: TipTapNode): string {
  return htmlBlock(doc);
}
