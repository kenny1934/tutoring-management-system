import { wrappingInputRule } from "@tiptap/core";
import { OrderedList } from "@tiptap/extension-list";

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
        find: /^(\d+)\.\s$/,
        type: this.type,
        getAttributes: (match) => ({ start: Number(match[1]) }),
      }),
    ];
  },
});
