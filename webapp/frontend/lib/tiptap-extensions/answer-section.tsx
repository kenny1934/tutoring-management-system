/**
 * Answer Section TipTap extension.
 * A collapsible answer block with inline alignment controls (always visible).
 * Supports left/center/right block alignment and float-left/float-right for
 * flowing text beside the answer section.
 *
 * When open, the answer content floats as position:absolute over the document
 * so the surrounding layout is unaffected.
 *
 * Print behaviour:
 *   - Teacher print: @media print makes content position:static (inline visible)
 *   - Student print: body.student-print hides all answer content via CSS
 */
import React from "react";
import { Node as TipTapNode } from "@tiptap/core";
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

function AnswerSectionComponent({ node, updateAttributes }: NodeViewProps) {
  const open = node.attrs.open as boolean;
  const align = node.attrs.align as string;

  return (
    <NodeViewWrapper className="answer-section-wrapper" style={ALIGN_STYLES[align] ?? {}}>
      <div contentEditable={false}>
        <div className="answer-section-header">
          <div className="answer-drag-handle" data-drag-handle title="Drag to reposition">
            <GripVertical className="answer-drag-icon" />
          </div>
          <button
            className="answer-toggle"
            onClick={() => updateAttributes({ open: !open })}
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
          <div className="answer-align-buttons">
            {ALIGN_OPTIONS.map(({ value, Icon, title }) => (
              <button
                type="button"
                key={value}
                className={`answer-align-btn${align === value ? " answer-align-active" : ""}`}
                onClick={() => updateAttributes({ align: value })}
                title={title}
              >
                <Icon className="answer-align-icon" />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={`answer-float-content${open ? " answer-float-open" : ""}`}>
        <NodeViewContent className="answer-float-inner" />
      </div>
    </NodeViewWrapper>
  );
}

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
        renderHTML: (attributes) => ({ "data-open": String(attributes.open) }),
      },
      align: {
        default: "left",
        parseHTML: (element) => element.getAttribute("data-align") || "left",
        renderHTML: (attributes) => ({ "data-align": String(attributes.align) }),
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
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs: { open: false, align: "left" },
              content: [{ type: "paragraph" }],
            })
            .run();
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(AnswerSectionComponent);
  },
});
