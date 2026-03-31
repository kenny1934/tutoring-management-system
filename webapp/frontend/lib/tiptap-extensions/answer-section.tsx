/**
 * Answer Section TipTap extension.
 * A collapsible answer block with inline alignment controls (always visible).
 * Supports left/center/right block alignment and float-left/float-right for
 * flowing text beside the answer section.
 *
 * When open, the answer content expands inline below the header.
 *
 * Print behaviour:
 *   - With Answers: answer content hidden inline; collected into Answer Key at end
 *   - Questions Only: body.student-print hides toggles + answer key via CSS
 */
import React, { useState, useEffect, useCallback } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Node as TipTapNode } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import {
  ChevronRight, ChevronDown, KeyRound, GripVertical,
  AlignLeft, AlignCenter, AlignRight, PanelLeft, PanelRight, Trash2,
} from "lucide-react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    answerSection: {
      insertAnswerSection: () => ReturnType;
    };
  }
}

const ALIGN_OPTIONS = [
  { value: "left",       Icon: AlignLeft,   title: "Align left" },
  { value: "center",     Icon: AlignCenter, title: "Center" },
  { value: "right",      Icon: AlignRight,  title: "Align right" },
  { value: "wrap-left",  Icon: PanelLeft,   title: "Float left (text wraps right)" },
  { value: "wrap-right", Icon: PanelRight,  title: "Float right (text wraps left)" },
] as const;

// Inline styles applied to NodeViewWrapper — highest specificity, not affected by TipTap's CSS
const ALIGN_STYLES: Record<string, React.CSSProperties> = {
  left:        {},
  center:      { width: "fit-content", marginLeft: "auto", marginRight: "auto" },
  right:       { width: "fit-content", marginLeft: "auto" },
  "wrap-left":  { float: "left",  width: "45%", marginRight: "1em", marginBottom: "0.5em" },
  "wrap-right": { float: "right", width: "45%", marginLeft:  "1em", marginBottom: "0.5em" },
};

// Tracks collapsed answer section getPos callbacks per editor instance.
// Positions are resolved live at arrow-key time (not cached) to avoid staleness after edits.
const collapsedGetters = new WeakMap<object, Set<() => number | undefined>>();

function AnswerSectionComponent({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const [open, setOpen] = useState<boolean>(() => node.attrs.open as boolean);
  const align = node.attrs.align as string;
  const label = (node.attrs.label as string) || "";
  const [editingLabel, setEditingLabel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isEditable = editor.isEditable;

  const deleteNode = useCallback(() => {
    const pos = getPos?.();
    if (pos === undefined) return;
    editor.commands.setNodeSelection(pos);
    editor.commands.deleteSelection();
  }, [getPos, editor]);

  // Empty paragraph = 4 ProseMirror units (node open/close + paragraph open/close)
  const EMPTY_CONTENT_SIZE = 4;
  const handleDelete = useCallback(() => {
    if (node.content.size > EMPTY_CONTENT_SIZE) { setConfirmDelete(true); return; }
    deleteNode();
  }, [node, deleteNode]);

  useEffect(() => {
    if (!getPos) return;
    const key = editor as object;
    if (!collapsedGetters.has(key)) collapsedGetters.set(key, new Set());
    const set = collapsedGetters.get(key)!;
    if (open) { set.delete(getPos); } else { set.add(getPos); }
    return () => { set.delete(getPos); };
  }, [open, getPos, editor]);

  return (
    <NodeViewWrapper className="answer-section-wrapper" data-label={label || undefined} style={ALIGN_STYLES[align] ?? {}}>
      <div contentEditable={false}>
        <div className="answer-section-header">
          <div className="answer-drag-handle" data-drag-handle title="Drag to reposition">
            <GripVertical className="answer-drag-icon" />
          </div>
          <button
            className="answer-toggle"
            onClick={() => setOpen(o => !o)}
            title={open ? "Hide answer" : "Show answer"}
          >
            {open ? (
              <ChevronDown className="answer-toggle-icon" />
            ) : (
              <ChevronRight className="answer-toggle-icon" />
            )}
            <KeyRound className="answer-toggle-key-icon" />
            Answer
          </button>
          {editingLabel ? (
            <input
              className="answer-label-input"
              type="text"
              value={label}
              placeholder="#"
              autoFocus
              readOnly={!isEditable}
              onChange={(e) => updateAttributes({ label: e.target.value })}
              onBlur={() => setEditingLabel(false)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingLabel(false); }}
            />
          ) : (
            <button
              className="answer-label-btn"
              disabled={!isEditable}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setEditingLabel(true)}
              title="Set custom label (overrides auto-number in print)"
            >
              {label || "#"}
            </button>
          )}
          <div className="answer-align-buttons">
            {ALIGN_OPTIONS.map(({ value, Icon, title }) => (
              <button
                type="button"
                key={value}
                className={`answer-align-btn${align === value ? " answer-align-active" : ""}`}
                disabled={!isEditable}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateAttributes({ align: value })}
                title={title}
              >
                <Icon className="answer-align-icon" />
              </button>
            ))}
            <button
              type="button"
              className="answer-delete-btn"
              disabled={!isEditable}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleDelete}
              title="Delete answer section"
            >
              <Trash2 className="answer-align-icon" />
            </button>
          </div>
        </div>
      </div>
      <div
        className={`answer-float-content${open ? " answer-float-open" : ""}`}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            const pos = getPos?.();
            if (pos !== undefined) editor.commands.setTextSelection(pos);
          }
        }}
      >
        <NodeViewContent className="answer-float-inner" />
      </div>
      <ConfirmDialog
        isOpen={confirmDelete}
        onConfirm={() => { setConfirmDelete(false); deleteNode(); }}
        onCancel={() => setConfirmDelete(false)}
        title="Delete answer section?"
        message="This answer section has content that will be lost."
        confirmText="Delete"
        variant="danger"
      />
    </NodeViewWrapper>
  );
}

// ─── Arrow-key skip helpers for collapsed answer sections ────────────

function isCollapsedAt(editor: Editor, pos: number): boolean {
  const set = collapsedGetters.get(editor as object);
  if (!set) return false;
  for (const gp of set) {
    if (gp() === pos) return true;
  }
  return false;
}

/** Find a collapsed answerSection after the cursor's top-level block. Returns its start position or null. */
function findCollapsedAfter(editor: Editor): { pos: number; size: number } | null {
  const { $from } = editor.state.selection;
  if ($from.depth < 1) return null;
  const after = $from.after(1);
  const node = editor.state.doc.nodeAt(after);
  if (node?.type.name === "answerSection" && isCollapsedAt(editor, after)) {
    return { pos: after, size: node.nodeSize };
  }
  return null;
}

/** Find a collapsed answerSection before the cursor's top-level block. Returns its start position or null. */
function findCollapsedBefore(editor: Editor): { pos: number } | null {
  const { $from } = editor.state.selection;
  if ($from.depth < 1) return null;
  const before = $from.before(1);
  if (before <= 0) return null;
  const resolved = editor.state.doc.resolve(before);
  const node = resolved.nodeBefore;
  if (node?.type.name === "answerSection") {
    const startPos = before - node.nodeSize;
    if (isCollapsedAt(editor, startPos)) return { pos: startPos };
  }
  return null;
}

// ─── Extension definition ────────────────────────────────────────────

export const AnswerSection = TipTapNode.create({
  name: "answerSection",
  group: "block",
  content: "block+",
  draggable: true,
  atom: false,
  defining: true,

  addAttributes() {
    return {
      open: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-open") === "true",
        renderHTML: () => ({}), // never persist — open/close is local React state
      },
      align: {
        default: "left",
        parseHTML: (element) => element.getAttribute("data-align") || "left",
        renderHTML: (attributes) => ({ "data-align": String(attributes.align) }),
      },
      label: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-label") || "",
        renderHTML: (attributes) => {
          if (!attributes.label) return {};
          return { "data-label": attributes.label };
        },
      },
    };
  },

  parseHTML() {
    return [{
      tag: 'div[data-type="answer-section"]',
      // Reject nested answer sections — prevents paste-nesting which produces malformed print output
      getAttrs: (element) => {
        if ((element as HTMLElement).parentElement?.closest?.('div[data-type="answer-section"]')) return false;
        return {};
      },
    }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { "data-type": "answer-section", ...HTMLAttributes },
      0,
    ];
  },

  addCommands() {
    return {
      insertAnswerSection:
        () =>
        ({ chain, state }) => {
          // Move to end of current block first to avoid splitting mid-paragraph
          const { $from } = state.selection;
          const endOfBlock = $from.depth >= 1 ? $from.end(1) : $from.pos;
          return chain()
            .setTextSelection(endOfBlock)
            .insertContent({
              type: this.name,
              attrs: { align: "left" },
              content: [{ type: "paragraph" }],
            })
            .run();
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-a": () => this.editor.commands.insertAnswerSection(),
      // Arrow keys skip over collapsed answer sections
      ArrowRight: () => { const f = findCollapsedAfter(this.editor); if (f) { this.editor.commands.setTextSelection(f.pos + f.size); return true; } return false; },
      ArrowDown:  () => { const f = findCollapsedAfter(this.editor); if (f) { this.editor.commands.setTextSelection(f.pos + f.size); return true; } return false; },
      ArrowLeft:  () => { const f = findCollapsedBefore(this.editor); if (f) { this.editor.commands.setTextSelection(f.pos); return true; } return false; },
      ArrowUp:    () => { const f = findCollapsedBefore(this.editor); if (f) { this.editor.commands.setTextSelection(f.pos); return true; } return false; },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(AnswerSectionComponent);
  },
});
