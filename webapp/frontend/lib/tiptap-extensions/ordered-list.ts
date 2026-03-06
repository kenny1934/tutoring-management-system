import { wrappingInputRule } from "@tiptap/core";
import { OrderedList } from "@tiptap/extension-list";

export const CustomOrderedList = OrderedList.extend({
  addInputRules() {
    return [
      wrappingInputRule({
        find: /^1\.\s$/,
        type: this.type,
        getAttributes: () => ({ start: 1 }),
      }),
    ];
  },
});
