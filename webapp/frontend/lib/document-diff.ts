import { diffWords } from "diff";

export interface DiffSegment {
  value: string;
  added?: boolean;
  removed?: boolean;
}

interface PmNode {
  type?: string;
  text?: string;
  content?: PmNode[];
  attrs?: Record<string, unknown>;
}

/**
 * Extract plaintext from a ProseMirror JSON document.
 * Non-text nodes (images, math, geometry) become placeholder tokens.
 * Block nodes separated by newlines.
 */
export function extractTextFromPmJson(doc: Record<string, unknown>): string {
  return extractNode(doc as PmNode).replace(/\n{3,}/g, "\n\n").trim();
}

function extractNode(node: PmNode): string {
  if (!node || !node.type) return "";

  switch (node.type) {
    case "text":
      return node.text || "";

    case "doc":
      return extractChildren(node);

    case "paragraph":
      return extractChildren(node) + "\n";

    case "heading":
      return extractChildren(node) + "\n";

    case "hardBreak":
      return "\n";

    case "pageBreak":
      return "\n---\n";

    case "blockquote":
      return extractChildren(node) + "\n";

    case "codeBlock":
      return extractChildren(node) + "\n";

    case "bulletList":
      return (node.content || [])
        .map((item) => "\u2022 " + extractChildren(item))
        .join("\n") + "\n";

    case "orderedList": {
      const start = (node.attrs?.start as number) || 1;
      return (node.content || [])
        .map((item, i) => `${start + i}. ` + extractChildren(item))
        .join("\n") + "\n";
    }

    case "listItem":
      return extractChildren(node);

    case "table":
      return (node.content || []).map(extractNode).join("") + "\n";

    case "tableRow":
      return (node.content || []).map(extractNode).join("\t") + "\n";

    case "tableCell":
    case "tableHeader":
      return extractChildren(node);

    case "inlineMath":
      return `[Math: ${node.attrs?.latex || "?"}]`;

    case "blockMath":
      return `[Math: ${node.attrs?.latex || "?"}]\n`;

    case "geometryDiagram":
      return "[Diagram]\n";

    case "image":
      return "[Image]";

    case "answerSection":
      return "[Answer Section]\n" + extractChildren(node);

    case "horizontalRule":
      return "\n---\n";

    default:
      // Unknown node: recurse into children if present
      return node.content ? extractChildren(node) : "";
  }
}

function extractChildren(node: PmNode): string {
  if (!node.content) return "";
  return node.content.map(extractNode).join("");
}

/**
 * Compute a word-level diff between old and new ProseMirror JSON documents.
 * Returns segments ready for rendering: unchanged, added (green), removed (red).
 */
export function computeDocumentDiff(
  oldDoc: Record<string, unknown>,
  newDoc: Record<string, unknown>,
): DiffSegment[] {
  const oldText = extractTextFromPmJson(oldDoc);
  const newText = extractTextFromPmJson(newDoc);
  return diffWords(oldText, newText);
}
