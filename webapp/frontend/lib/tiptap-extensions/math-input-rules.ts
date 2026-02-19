/**
 * Custom input rules for standard LaTeX delimiters:
 *   $...$  → inlineMath node
 *   $$...$$ → blockMath node
 *
 * The official @tiptap/extension-mathematics uses $$...$$ for inline
 * and $$$...$$$ for block, which is non-standard. This overrides that.
 */
import { Extension, InputRule } from "@tiptap/core";

export function createMathInputRules() {
  return Extension.create({
    name: "mathInputRules",
    addInputRules() {
      const inlineMathType = this.editor.schema.nodes.inlineMath;
      const blockMathType = this.editor.schema.nodes.blockMath;
      return [
        // $...$ for inline math (single dollar signs)
        new InputRule({
          find: /(^|[^$])(\$([^$\n]+?)\$)(?!\$)/,
          handler: ({ state, range, match }) => {
            const latex = match[3];
            const { tr } = state;
            const start = range.from + match[1].length;
            tr.replaceWith(start, range.to, inlineMathType.create({ latex }));
          },
        }),
        // $$...$$ for block math (at start of line)
        new InputRule({
          find: /^\$\$([^$]+)\$\$$/,
          handler: ({ state, range, match }) => {
            const latex = match[1];
            const { tr } = state;
            tr.replaceWith(range.from, range.to, blockMathType.create({ latex }));
          },
        }),
      ];
    },
  });
}
