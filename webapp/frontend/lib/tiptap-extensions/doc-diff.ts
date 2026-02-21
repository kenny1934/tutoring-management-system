/**
 * ProseMirror JSON diff utility.
 *
 * Compares two ProseMirror JSON documents and returns annotated copies
 * with TipTap Highlight marks on changed text. This preserves all
 * existing formatting (bold, italic, tables, math, images) while adding
 * red/green background highlights for visual diffing.
 */
import { diffWords, diffArrays } from "diff";
import type { Change } from "diff";

// ── Colours ──────────────────────────────────────────────────────
export const DIFF_REMOVED_COLOR = "#fecaca"; // red-200
export const DIFF_ADDED_COLOR = "#bbf7d0";   // green-200

// ── Types ────────────────────────────────────────────────────────
type JsonNode = Record<string, unknown>;
type Mark = Record<string, unknown>;

interface DiffResult {
  oldDoc: JsonNode;
  newDoc: JsonNode;
}

interface TextSpan {
  startOffset: number;
  endOffset: number;
  text: string;
  marks: Mark[];
  isPlaceholder?: boolean;
  originalNode?: JsonNode;
}

// Unicode object-replacement character — used as a placeholder
// for non-text inline nodes (math, hard breaks, etc.)
const OBJ = "\uFFFC";

// ── Public API ───────────────────────────────────────────────────

export function computeDocDiff(
  oldDoc: JsonNode,
  newDoc: JsonNode,
): DiffResult {
  const oldBlocks = getContent(oldDoc);
  const newBlocks = getContent(newDoc);

  // Align blocks via fingerprint-based array diff
  const oldFP = oldBlocks.map(blockFingerprint);
  const newFP = newBlocks.map(blockFingerprint);
  const blockDiffs = diffArrays(oldFP, newFP);

  const resultOld: JsonNode[] = [];
  const resultNew: JsonNode[] = [];
  let oi = 0;
  let ni = 0;

  for (const change of blockDiffs) {
    const count = change.count ?? 0;
    if (!change.added && !change.removed) {
      // Matched blocks — diff inline content
      for (let i = 0; i < count; i++) {
        const [dOld, dNew] = diffBlockPair(oldBlocks[oi], newBlocks[ni]);
        resultOld.push(dOld);
        resultNew.push(dNew);
        oi++;
        ni++;
      }
    } else if (change.removed) {
      for (let i = 0; i < count; i++) {
        resultOld.push(highlightEntireBlock(oldBlocks[oi], DIFF_REMOVED_COLOR));
        oi++;
      }
    } else {
      for (let i = 0; i < count; i++) {
        resultNew.push(highlightEntireBlock(newBlocks[ni], DIFF_ADDED_COLOR));
        ni++;
      }
    }
  }

  return {
    oldDoc: { ...oldDoc, content: resultOld },
    newDoc: { ...newDoc, content: resultNew },
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function getContent(node: JsonNode): JsonNode[] {
  return (node.content as JsonNode[] | undefined) ?? [];
}

/** Produce a stable fingerprint for block-level alignment. */
function blockFingerprint(node: JsonNode): string {
  const type = node.type as string;
  const text = extractPlainText(node);
  if (text) return `${type}:${text}`;
  // For non-text blocks, use shallow JSON
  return `${type}:${JSON.stringify(node)}`;
}

/** Recursively extract all text from a node tree. */
function extractPlainText(node: JsonNode): string {
  if (node.type === "text") return node.text as string;
  const children = getContent(node);
  return children.map(extractPlainText).join("");
}

/** Recursively add highlight marks to every text node. */
function highlightEntireBlock(node: JsonNode, color: string): JsonNode {
  if (node.type === "text") {
    const marks: Mark[] = [...((node.marks as Mark[]) ?? [])];
    marks.push({ type: "highlight", attrs: { color } });
    return { ...node, marks };
  }
  const children = getContent(node);
  if (children.length > 0) {
    return { ...node, content: children.map((c) => highlightEntireBlock(c, color)) };
  }
  return node;
}

// ── Block-pair diffing ───────────────────────────────────────────

function diffBlockPair(oldBlock: JsonNode, newBlock: JsonNode): [JsonNode, JsonNode] {
  const type = oldBlock.type as string;

  // Tables: recurse row→cell
  if (type === "table") return diffTable(oldBlock, newBlock);

  // For blocks whose children are other blocks (list items, blockquotes, etc.)
  // recurse into their children as a mini-document
  const oldChildren = getContent(oldBlock);
  const newChildren = getContent(newBlock);

  if (oldChildren.length > 0 && !oldChildren.some((c) => (c.type as string) === "text")) {
    // All children are block-level — recurse
    const sub = computeDocDiff(
      { type: "doc", content: oldChildren },
      { type: "doc", content: newChildren },
    );
    return [
      { ...oldBlock, content: getContent(sub.oldDoc) },
      { ...newBlock, content: getContent(sub.newDoc) },
    ];
  }

  // Leaf block with inline content (paragraph, heading)
  return diffInlineContent(oldBlock, newBlock);
}

// ── Inline-content diff ──────────────────────────────────────────

function diffInlineContent(oldBlock: JsonNode, newBlock: JsonNode): [JsonNode, JsonNode] {
  const oldData = extractTextSpans(getContent(oldBlock));
  const newData = extractTextSpans(getContent(newBlock));

  // Fast path: identical text
  if (oldData.text === newData.text) return [oldBlock, newBlock];

  const changes = diffWords(oldData.text, newData.text);

  const newOldContent = buildHighlightedNodes(oldData.spans, changes, "old");
  const newNewContent = buildHighlightedNodes(newData.spans, changes, "new");

  return [
    { ...oldBlock, content: newOldContent },
    { ...newBlock, content: newNewContent },
  ];
}

/** Build flat text + spans mapping from inline children. */
function extractTextSpans(children: JsonNode[]): { text: string; spans: TextSpan[] } {
  const spans: TextSpan[] = [];
  let offset = 0;

  for (const child of children) {
    if ((child.type as string) === "text") {
      const t = child.text as string;
      spans.push({
        startOffset: offset,
        endOffset: offset + t.length,
        text: t,
        marks: (child.marks as Mark[]) ?? [],
      });
      offset += t.length;
    } else {
      // Non-text inline node (math, hardBreak, image, etc.) — placeholder
      spans.push({
        startOffset: offset,
        endOffset: offset + 1,
        text: OBJ,
        marks: [],
        isPlaceholder: true,
        originalNode: child,
      });
      offset += 1;
    }
  }

  return { text: spans.map((s) => s.text).join(""), spans };
}

/**
 * Walk diff changes and build the annotated node array for one side.
 *
 * For "old" side: skip `added` changes, highlight `removed` ones red.
 * For "new" side: skip `removed` changes, highlight `added` ones green.
 */
function buildHighlightedNodes(
  spans: TextSpan[],
  changes: Change[],
  side: "old" | "new",
): JsonNode[] {
  const result: JsonNode[] = [];
  let charOffset = 0;

  for (const change of changes) {
    // Determine if this change applies to our side
    if (side === "old" && change.added) continue;
    if (side === "new" && change.removed) continue;

    const shouldHighlight = side === "old" ? change.removed : change.added;
    const color = side === "old" ? DIFF_REMOVED_COLOR : DIFF_ADDED_COLOR;
    const len = change.value.length;
    const end = charOffset + len;

    // Find all spans overlapping [charOffset, end)
    for (const span of spans) {
      if (span.endOffset <= charOffset) continue;
      if (span.startOffset >= end) break;

      const overlapStart = Math.max(charOffset, span.startOffset);
      const overlapEnd = Math.min(end, span.endOffset);

      if (span.isPlaceholder && span.originalNode) {
        // Emit the original non-text node as-is
        result.push(span.originalNode);
        continue;
      }

      const sliceStart = overlapStart - span.startOffset;
      const sliceEnd = overlapEnd - span.startOffset;
      const sliceText = span.text.slice(sliceStart, sliceEnd);
      if (!sliceText) continue;

      const marks: Mark[] = [...span.marks];
      if (shouldHighlight) {
        marks.push({ type: "highlight", attrs: { color } });
      }

      result.push({
        type: "text",
        text: sliceText,
        ...(marks.length > 0 ? { marks } : {}),
      });
    }

    charOffset = end;
  }

  return result;
}

// ── Table diff ───────────────────────────────────────────────────

function diffTable(oldTable: JsonNode, newTable: JsonNode): [JsonNode, JsonNode] {
  const oldRows = getContent(oldTable);
  const newRows = getContent(newTable);
  const maxRows = Math.max(oldRows.length, newRows.length);

  const resOldRows: JsonNode[] = [];
  const resNewRows: JsonNode[] = [];

  for (let r = 0; r < maxRows; r++) {
    if (r >= oldRows.length) {
      resNewRows.push(highlightEntireBlock(newRows[r], DIFF_ADDED_COLOR));
      continue;
    }
    if (r >= newRows.length) {
      resOldRows.push(highlightEntireBlock(oldRows[r], DIFF_REMOVED_COLOR));
      continue;
    }

    // Diff cells within the row
    const oldCells = getContent(oldRows[r]);
    const newCells = getContent(newRows[r]);
    const maxCols = Math.max(oldCells.length, newCells.length);
    const resOldCells: JsonNode[] = [];
    const resNewCells: JsonNode[] = [];

    for (let c = 0; c < maxCols; c++) {
      if (c >= oldCells.length) {
        resNewCells.push(highlightEntireBlock(newCells[c], DIFF_ADDED_COLOR));
        continue;
      }
      if (c >= newCells.length) {
        resOldCells.push(highlightEntireBlock(oldCells[c], DIFF_REMOVED_COLOR));
        continue;
      }

      // Each cell contains block-level content (paragraphs) — recurse
      const sub = computeDocDiff(
        { type: "doc", content: getContent(oldCells[c]) },
        { type: "doc", content: getContent(newCells[c]) },
      );
      resOldCells.push({ ...oldCells[c], content: getContent(sub.oldDoc) });
      resNewCells.push({ ...newCells[c], content: getContent(sub.newDoc) });
    }

    resOldRows.push({ ...oldRows[r], content: resOldCells });
    resNewRows.push({ ...newRows[r], content: resNewCells });
  }

  return [
    { ...oldTable, content: resOldRows },
    { ...newTable, content: resNewRows },
  ];
}
