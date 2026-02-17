import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ResizableImageComponent } from "@/components/documents/ResizableImageComponent";

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-align") || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.align) return {};
          return { "data-align": attributes.align };
        },
      },
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const w = element.getAttribute("width") || element.style.width;
          return w ? parseInt(String(w), 10) || null : null;
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.width) return {};
          return { width: String(attributes.width) };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});
