import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

const INDENT_UNIT = 2; // em per level
const MAX_INDENT = 8;

export const Indent = Extension.create({
  name: "indent",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => {
              const ml = element.style.marginLeft;
              if (!ml) return 0;
              // Parse "Xem" → level
              const match = ml.match(/^([\d.]+)em$/);
              if (match) return Math.round(parseFloat(match[1]) / INDENT_UNIT);
              return 0;
            },
            renderHTML: (attributes) => {
              if (!attributes.indent || attributes.indent <= 0) return {};
              return { style: `margin-left: ${attributes.indent * INDENT_UNIT}em` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection;
          let changed = false;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.type.name === "paragraph" || node.type.name === "heading") {
              const current = node.attrs.indent || 0;
              if (current < MAX_INDENT) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  indent: current + 1,
                });
                changed = true;
              }
            }
          });
          if (changed && dispatch) dispatch(tr);
          return changed;
        },
      outdent:
        () =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection;
          let changed = false;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.type.name === "paragraph" || node.type.name === "heading") {
              const current = node.attrs.indent || 0;
              if (current > 0) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  indent: current - 1,
                });
                changed = true;
              }
            }
          });
          if (changed && dispatch) dispatch(tr);
          return changed;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () =>
        this.editor.commands.sinkListItem("listItem") ||
        this.editor.commands.indent(),
      "Shift-Tab": () =>
        this.editor.commands.liftListItem("listItem") ||
        this.editor.commands.outdent(),
    };
  },
});
