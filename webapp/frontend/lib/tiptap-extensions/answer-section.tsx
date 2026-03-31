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
import React, { useState, useEffect } from "react";
import { Node as TipTapNode } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import {
  ChevronRight, ChevronDown, KeyRound, GripVertical,
  AlignLeft, AlignCenter, AlignRight, PanelLeft, PanelRight,
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

// Tracks which node positions are currently collapsed, per editor instance.
// Used by keyboard shortcut handlers to skip cursor over collapsed answer sections.
const collapsedPositions = new WeakMap<object, Set<number>>();

function AnswerSectionComponent({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  // open/close is local React state — not persisted to the document.
  // Prevents toggling from creating undo steps, triggering autosave, or polluting version history.
  const [open, setOpen] = useState<boolean>(() => node.attrs.open as boolean);
  const align = node.attrs.align as string;
  const label = (node.attrs.label as string) || "";
  const [editingLabel, setEditingLabel] = useState(false);
  const isEditable = editor.isEditable;

  // Register/deregister collapsed positions for arrow-key skip logic
  useEffect(() => {
    const pos = getPos?.();
    if (pos === undefined) return;
    const key = editor as object;
    if (!collapsedPositions.has(key)) collapsedPositions.set(key, new Set());
    const set = collapsedPositions.get(key)!;
    if (open) set.delete(pos); else set.add(pos);
    return () => { set.delete(pos); };
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
              onClick={() => isEditable && setEditingLabel(true)}
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
                onClick={() => isEditable && updateAttributes({ align: value })}
                title={title}
              >
                <Icon className="answer-align-icon" />
              </button>
            ))}
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
    </NodeViewWrapper>
  );
}

// ─── Arrow-key skip helpers for collapsed answer sections ────────────

function isCollapsed(editor: Editor, pos: number): boolean {
  return collapsedPositions.get(editor as object)?.has(pos) ?? false;
}

function skipIfCollapsedAfter(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  // Find position right after the current top-level block
  const depth = Math.max($from.depth, 1);
  const after = $from.after(depth);
  const nodeAfter = editor.state.doc.nodeAt(after);
  if (nodeAfter?.type.name === "answerSection" && isCollapsed(editor, after)) {
    editor.commands.setTextSelection(after + nodeAfter.nodeSize);
    return true;
  }
  return false;
}

function skipIfCollapsedBefore(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  const depth = Math.max($from.depth, 1);
  const before = $from.before(depth);
  if (before <= 0) return false;
  const resolved = editor.state.doc.resolve(before);
  const nodeBefore = resolved.nodeBefore;
  if (nodeBefore?.type.name === "answerSection") {
    const startPos = before - nodeBefore.nodeSize;
    if (isCollapsed(editor, startPos)) {
      editor.commands.setTextSelection(startPos);
      return true;
    }
  }
  return false;
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
    return [{ tag: 'div[data-type="answer-section"]' }];
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
      ArrowRight: () => skipIfCollapsedAfter(this.editor),
      ArrowDown:  () => skipIfCollapsedAfter(this.editor),
      ArrowLeft:  () => skipIfCollapsedBefore(this.editor),
      ArrowUp:    () => skipIfCollapsedBefore(this.editor),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(AnswerSectionComponent);
  },
});
