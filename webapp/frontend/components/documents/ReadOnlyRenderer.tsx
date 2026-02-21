"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Mathematics } from "@tiptap/extension-mathematics";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import { Extension } from "@tiptap/core";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { createMathInputRules, createGeometryDiagramNode, ResizableImage, PageBreak, AnswerSection, Indent, LineSpacing } from "@/lib/tiptap-extensions";
import { cn } from "@/lib/utils";
import "katex/dist/katex.min.css";

const ROTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.backgroundColor || null,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.backgroundColor ? { style: `background-color: ${attrs.backgroundColor}` } : {},
      },
    };
  },
});

const ROTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.backgroundColor || null,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.backgroundColor ? { style: `background-color: ${attrs.backgroundColor}` } : {},
      },
    };
  },
});

const ROTextStyles = Extension.create({
  name: "customTextStyles",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (element) => element.style.fontSize || null,
          renderHTML: (attributes) => {
            if (!attributes.fontSize) return {};
            return { style: `font-size: ${attributes.fontSize}` };
          },
        },
        fontFamily: {
          default: null,
          parseHTML: (element) => element.style.fontFamily || null,
          renderHTML: (attributes) => {
            if (!attributes.fontFamily) return {};
            return { style: `font-family: ${attributes.fontFamily}` };
          },
        },
      },
    }];
  },
});

const readOnlyExtensions = [
  StarterKit.configure({}),
  TextStyle,
  Color,
  ROTextStyles,
  Subscript,
  Superscript,
  Highlight.configure({ multicolor: true }),
  Link.configure({ openOnClick: false, HTMLAttributes: { class: "doc-link" } }),
  Mathematics.configure({ katexOptions: { throwOnError: false } }),
  createMathInputRules(),
  createGeometryDiagramNode({}),
  ResizableImage.configure({
    inline: false,
    allowBase64: false,
    HTMLAttributes: { class: "document-image" },
  }),
  Underline,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  PageBreak,
  AnswerSection,
  Table.configure({ resizable: false, cellMinWidth: 40 }),
  TableRow,
  ROTableCell,
  ROTableHeader,
  Indent,
  LineSpacing,
];

interface ReadOnlyRendererProps {
  content: Record<string, unknown> | null;
  paperMode?: boolean;
}

export function ReadOnlyRenderer({ content, paperMode = true }: ReadOnlyRendererProps) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: readOnlyExtensions,
    content: content || { type: "doc", content: [{ type: "paragraph" }] },
  });

  return (
    <EditorContent
      editor={editor}
      className={cn("document-editor-content prose prose-sm max-w-none", !paperMode && "prose-invert")}
    />
  );
}
