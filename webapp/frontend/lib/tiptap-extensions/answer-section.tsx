/**
 * Answer Section TipTap extension.
 * A floating collapsible block — when toggled open, the answer content
 * overlays the surrounding document (position: absolute) so the worksheet
 * layout is completely unaffected by open/close state.
 *
 * Print behaviour:
 *   - Teacher print (default): @media print forces position:static so all
 *     answers appear inline below their toggle button.
 *   - Student print: add class "student-print" to <body> before window.print();
 *     this hides all answer content via CSS.
 */
import { Node as TipTapNode } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { ChevronRight, ChevronDown, KeyRound } from "lucide-react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    answerSection: {
      insertAnswerSection: () => ReturnType;
    };
  }
}

function AnswerSectionComponent({ node, updateAttributes }: NodeViewProps) {
  const open = node.attrs.open as boolean;

  return (
    <NodeViewWrapper className="answer-section-wrapper">
      <button
        className="answer-toggle"
        contentEditable={false}
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
  atom: false,
  defining: true,

  addAttributes() {
    return {
      open: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-open") === "true",
        renderHTML: (attributes) => ({ "data-open": String(attributes.open) }),
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
              attrs: { open: false },
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
