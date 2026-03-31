import { wrappingInputRule } from "@tiptap/core";
import { OrderedList } from "@tiptap/extension-list";

// Only trigger on explicit space (not Enter/newline) — matches Word/Google Docs behavior.
// Stock TipTap uses /^(\d+)\.\s$/ where \s matches \n, causing Enter to trigger list creation.
const orderedListRegex = /^(\d+)\. $/;

export const CustomOrderedList = OrderedList.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      keepMarks: true,
      keepAttributes: true,
    };
  },
  addInputRules() {
    return [
      wrappingInputRule({
        find: orderedListRegex,
        type: this.type,
        getAttributes: (match) => ({ start: +match[1] }),
        joinPredicate: (match, node) => node.childCount + node.attrs.start === +match[1],
      }),
    ];
  },
});
