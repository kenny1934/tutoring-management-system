"use client";

import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Mathematics } from "@tiptap/extension-mathematics";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Highlight from "@tiptap/extension-highlight";
import CharacterCount from "@tiptap/extension-character-count";
import Link from "@tiptap/extension-link";
import { Extension } from "@tiptap/core";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import type { Node as PmNode } from "@tiptap/pm/model";
import { createMathInputRules, createGeometryDiagramNode, ResizableImage, PageBreak } from "@/lib/tiptap-extensions";
import { useClickOutside } from "@/lib/hooks";
import "katex/dist/katex.min.css";
import {
  ArrowLeft,
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  TextQuote,
  Code,
  Underline as UnderlineIcon,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Highlighter,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Link as LinkIcon,
  Unlink,
  Undo2,
  Redo2,
  SeparatorHorizontal,
  ScissorsLineDashed,
  ChevronDown,
  Tags,
  Sigma,
  Hexagon,
  Image as ImageIcon,
  Grid3X3,
  Printer,
  Check,
  Loader2,
  CloudOff,
  Plus,
  Minus,
  Trash2,
  ToggleLeft,
  Type,
  PlusCircle,
  FileSliders,
  Download,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { documentsAPI } from "@/lib/document-api";
import MathEditorModal from "@/components/inbox/MathEditorModal";
import GeometryEditorModal from "@/components/inbox/GeometryEditorModal";
import type { GeometryState } from "@/lib/geometry-utils";
import { PageLayoutModal } from "@/components/documents/PageLayoutModal";
import type { Document, DocumentMetadata, DocumentHeaderFooter } from "@/types";

const EDITOR_COLORS = [
  { label: "Red", color: "#dc2626" },
  { label: "Orange", color: "#ea580c" },
  { label: "Green", color: "#16a34a" },
  { label: "Blue", color: "#2563eb" },
  { label: "Purple", color: "#9333ea" },
  { label: "Gray", color: "#6b7280" },
];

const HIGHLIGHT_COLORS = [
  { label: "Yellow", color: "#fef08a" },
  { label: "Green", color: "#bbf7d0" },
  { label: "Blue", color: "#bfdbfe" },
  { label: "Pink", color: "#fbcfe8" },
  { label: "Orange", color: "#fed7aa" },
  { label: "Purple", color: "#e9d5ff" },
];

const FONT_SIZES = [
  { label: "8", value: "8px" },
  { label: "10", value: "10px" },
  { label: "12", value: "12px" },
  { label: "14", value: "14px" },
  { label: "16", value: null },
  { label: "18", value: "18px" },
  { label: "20", value: "20px" },
  { label: "24", value: "24px" },
  { label: "28", value: "28px" },
  { label: "36", value: "36px" },
  { label: "48", value: "48px" },
  { label: "72", value: "72px" },
];

const FONT_FAMILIES = [
  { label: "Default", value: null },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Calibri", value: "Calibri, 'Gill Sans', sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Garamond", value: "Garamond, 'EB Garamond', serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  { label: "Comic Sans", value: "'Comic Sans MS', cursive" },
  { label: "思源黑體", value: "'Noto Sans TC', 'Microsoft JhengHei', 'PingFang TC', sans-serif" },
  { label: "思源宋體", value: "'Noto Serif TC', 'PMingLiU', 'Songti TC', serif" },
  { label: "標楷體", value: "'DFKai-SB', 'BiauKai', 'Kaiti TC', serif" },
];

const ALIGN_OPTIONS = [
  { icon: AlignLeft, label: "Align Left", value: "left" as const },
  { icon: AlignCenter, label: "Align Center", value: "center" as const },
  { icon: AlignRight, label: "Align Right", value: "right" as const },
];

const HEADING_OPTIONS = [
  { label: "Normal", level: null, className: "text-sm" },
  { label: "Heading 1", level: 1 as const, className: "text-lg font-bold" },
  { label: "Heading 2", level: 2 as const, className: "text-base font-semibold" },
  { label: "Heading 3", level: 3 as const, className: "text-sm font-semibold" },
];

// Custom text style attributes via TextStyle global attributes
const CustomTextStyles = Extension.create({
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

type ToolbarTab = "format" | "insert";

const AUTOSAVE_DELAY = 2000;

function renderHeaderFooterContent(template: string, docTitle: string): React.ReactNode {
  if (!template) return null;
  const resolved = template
    .replace(/\{title\}/g, docTitle)
    .replace(/\{date\}/g, new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }));

  // Split on {page} and interleave with page-number spans
  const parts = resolved.split("{page}");
  if (parts.length === 1) return resolved;

  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && <span className="print-page-number" />}
        </Fragment>
      ))}
    </>
  );
}

// Build @page margin box CSS for header/footer sections that use {page}.
// Chrome only supports counter(page) inside @page margin boxes, not regular elements.
// When ANY cell in a section has {page}, ALL cells move to @page margin boxes
// and the HTML element is hidden (avoiding double-rendering).
function buildPageMarginCSS(meta: DocumentMetadata | null, docTitle: string): string {
  if (!meta) return "";
  const rules: string[] = [];

  const resolveText = (template: string) =>
    template
      .replace(/\{title\}/g, docTitle)
      .replace(/\{date\}/g, new Date().toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric",
      }));

  const buildContent = (template: string) => {
    const resolved = resolveText(template);
    const parts = resolved.split("{page}");
    return parts
      .flatMap((text, i) => {
        const items: string[] = [];
        if (text) items.push(`"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
        if (i < parts.length - 1) items.push("counter(page)");
        return items;
      })
      .join(" ");
  };

  const processSection = (
    section: DocumentHeaderFooter | undefined,
    boxes: [string, string, string],
  ) => {
    if (!section?.enabled) return;
    const hasPage = [section.left, section.center, section.right]
      .some(t => t?.includes("{page}"));
    if (!hasPage) return;

    const hasImage = !!section.imageUrl;
    const cells = [section.left, section.center, section.right];
    cells.forEach((text, i) => {
      if (!text) return;
      // When section has image (not hidden entirely), only process {page} cells
      if (hasImage && !text.includes("{page}")) return;
      const content = buildContent(text);
      if (content) {
        rules.push(`${boxes[i]} { content: ${content}; font-size: 9px; color: #888; vertical-align: top; }`);
      }
    });
  };

  processSection(meta.header, ["@top-left", "@top-center", "@top-right"]);
  processSection(meta.footer, ["@bottom-left", "@bottom-center", "@bottom-right"]);

  return rules.length ? rules.join(" ") : "";
}

function sectionShouldHideEntirely(section?: DocumentHeaderFooter): boolean {
  if (!section?.enabled) return false;
  if (section.imageUrl) return false;  // keep HTML visible for image
  return [section.left, section.center, section.right]
    .some(t => t?.includes("{page}"));
}

// Build the HTML body sent to weasyprint for PDF export.
// Uses running() elements for headers/footers so images and page numbers
// render in the same margin box context with proper sizing.
function buildPdfHtml(
  editorHtml: string,
  meta: DocumentMetadata | null,
  docTitle: string,
  geoAttrs: { width: number | null; align: string | null }[] = [],
): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const resolveText = (template: string) =>
    template
      .replace(/\{title\}/g, escape(docTitle))
      .replace(/\{date\}/g, new Date().toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric",
      }));

  // Build inner HTML for a cell: optional image + text with {page} replaced by counter spans
  const cellInner = (
    text: string,
    imageUrl: string | null | undefined,
    imagePosition: string | null | undefined,
    cellPos: string,
  ): string => {
    const parts: string[] = [];
    if (imageUrl && imagePosition === cellPos) {
      const margin = cellPos === "right" ? "margin-left:4px;" : "margin-right:4px;";
      parts.push(`<img src="${imageUrl.replace(/"/g, "&quot;")}" style="max-height:8mm;width:auto;vertical-align:middle;${margin}" />`);
    }
    if (text) {
      const resolved = resolveText(text);
      const pageParts = resolved.split("{page}");
      for (let i = 0; i < pageParts.length; i++) {
        if (pageParts[i]) parts.push(pageParts[i]);
        if (i < pageParts.length - 1) parts.push('<span class="pdf-page-number"></span>');
      }
    }
    return parts.join("");
  };

  const sectionHtml = (
    section: DocumentHeaderFooter | undefined,
    prefix: string,
  ): string => {
    if (!section?.enabled) return "";
    return (["left", "center", "right"] as const).map((pos) => {
      const text = pos === "left" ? section.left : pos === "center" ? section.center : section.right;
      const inner = cellInner(text, section.imageUrl, section.imagePosition, pos);
      return inner ? `<div class="pdf-${prefix}-${pos}">${inner}</div>` : "";
    }).join("");
  };

  let watermarkHtml = "";
  if (meta?.watermark?.enabled) {
    if (meta.watermark.type === "text" && meta.watermark.text) {
      watermarkHtml = `<div class="pdf-watermark">${escape(meta.watermark.text)}</div>`;
    } else if (meta.watermark.type === "image" && meta.watermark.imageUrl) {
      watermarkHtml = `<img class="pdf-watermark" src="${meta.watermark.imageUrl.replace(/"/g, "&quot;")}" />`;
    }
  }

  // Post-process editor HTML to apply geometry diagram widths/alignment from ProseMirror state.
  // This bypasses renderHTML HTMLAttributes issues — node.attrs are always the raw values.
  let processedEditorHtml = editorHtml;
  if (geoAttrs.length > 0 && typeof window !== "undefined") {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(editorHtml, "text/html");
    const geoEls = parsed.querySelectorAll('[data-type="geometry-diagram"]');
    geoEls.forEach((el, i) => {
      const attrs = geoAttrs[i];
      if (!attrs) return;
      const styles: string[] = [];
      if (attrs.width) styles.push(`width:${attrs.width}px;max-width:100%;`);
      if (attrs.align === "center") styles.push("margin:0 auto;display:block;");
      else if (attrs.align === "right") styles.push("margin-left:auto;display:block;");
      if (styles.length) (el as HTMLElement).style.cssText = styles.join("");
    });
    processedEditorHtml = parsed.body.innerHTML;
  }

  return [
    sectionHtml(meta?.header, "header"),
    sectionHtml(meta?.footer, "footer"),
    watermarkHtml,
    `<div class="pdf-content">${processedEditorHtml}</div>`,
  ].join("");
}

// Build CSS for weasyprint PDF export using running()/element() paged media.
// weasyprint fully supports this (since v51), giving us actual HTML elements
// (with images, text, page counters) in @page margin boxes.
function buildPdfExportCSS(meta: DocumentMetadata | null): string {
  const margins = meta?.margins;
  const top = margins?.top ?? 25.4;
  const right = margins?.right ?? 25.4;
  const bottom = margins?.bottom ?? 25.4;
  const left = margins?.left ?? 25.4;

  const runningRules: string[] = [];
  const pageRules: string[] = [];

  const addSection = (
    section: DocumentHeaderFooter | undefined,
    defs: ["left" | "center" | "right", string, string][],
    prefix: string,
  ) => {
    if (!section?.enabled) return;
    for (const [pos, marginBox, elemName] of defs) {
      const text = pos === "left" ? section.left : pos === "center" ? section.center : section.right;
      const hasContent = !!text || (section.imageUrl && section.imagePosition === pos);
      if (!hasContent) continue;
      const justify = pos === "right" ? "flex-end" : pos === "center" ? "center" : "flex-start";
      runningRules.push(`.pdf-${prefix}-${pos} { position: running(${elemName}); display: flex; align-items: center; justify-content: ${justify}; font-size: 9px; color: #888; }`);
      pageRules.push(`${marginBox} { content: element(${elemName}); }`);
    }
  };

  addSection(meta?.header, [
    ["left", "@top-left", "hdrL"],
    ["center", "@top-center", "hdrC"],
    ["right", "@top-right", "hdrR"],
  ], "header");
  addSection(meta?.footer, [
    ["left", "@bottom-left", "ftrL"],
    ["center", "@bottom-center", "ftrC"],
    ["right", "@bottom-right", "ftrR"],
  ], "footer");

  let watermarkCss = "";
  if (meta?.watermark?.enabled) {
    if (meta.watermark.type === "text") {
      watermarkCss = `
.pdf-watermark {
  position: fixed; top: 50%; left: 50%;
  transform: translate(-50%, -50%) rotate(-45deg);
  font-size: 80px; font-weight: bold; color: #000;
  white-space: nowrap; z-index: -1; pointer-events: none;
  opacity: ${meta.watermark.opacity};
}`;
    } else if (meta.watermark.type === "image") {
      const size = meta.watermark.imageSize ?? 60;
      watermarkCss = `
img.pdf-watermark {
  position: fixed; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: ${size}%; height: auto;
  opacity: ${meta.watermark.opacity}; z-index: -1;
}`;
    }
  }

  return `
@page {
  size: A4;
  margin: ${top}mm ${right}mm ${bottom}mm ${left}mm;
  ${pageRules.join("\n  ")}
}
${runningRules.join("\n")}
.pdf-page-number::after { content: counter(page); }
${watermarkCss}
body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; line-height: 1.6; color: #1a1a1a; }
h1 { font-size: 2em; font-weight: bold; margin: 0.67em 0; }
h2 { font-size: 1.5em; font-weight: 600; margin: 0.75em 0; }
h3 { font-size: 1.17em; font-weight: 600; margin: 0.83em 0; }
p { margin: 0.5em 0; }
blockquote { border-left: 3px solid #ddd; padding-left: 1em; color: #666; margin: 1em 0; }
code { background: #f5f5f5; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
ul, ol { padding-left: 1.5em; }
a { color: #2563eb; text-decoration: underline; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #ddd; padding: 6px 12px; text-align: left; min-width: 40px; }
th { background: #f9f9f9; font-weight: 600; }
img { max-width: 100%; height: auto; }
div[data-type="geometry-diagram"] { max-width: 80%; }
.document-image { display: block; margin: 1em auto; }
sup { vertical-align: super; font-size: 0.8em; }
sub { vertical-align: sub; font-size: 0.8em; }
s { text-decoration: line-through; }
u { text-decoration: underline; }
mark { padding: 0.1em 0.2em; border-radius: 2px; }
.page-break-node { break-after: page; height: 0; margin: 0; padding: 0; border: none; }
`;
}

interface DocumentEditorProps {
  document: Document;
  onUpdate: () => void;
}

export function DocumentEditor({ document: doc, onUpdate }: DocumentEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(doc.title);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);

  // Dropdown states
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showFontSizeMenu, setShowFontSizeMenu] = useState(false);
  const [showFontFamilyMenu, setShowFontFamilyMenu] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [showAlignMenu, setShowAlignMenu] = useState(false);
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [gridHover, setGridHover] = useState<{ rows: number; cols: number } | null>(null);

  // Toolbar label mode
  const [showLabels, setShowLabels] = useState(false);
  useEffect(() => {
    setShowLabels(localStorage.getItem("doc-editor-toolbar-labels") === "true");
  }, []);
  useEffect(() => {
    localStorage.setItem("doc-editor-toolbar-labels", String(showLabels));
  }, [showLabels]);

  // Toolbar tab state
  const [activeTab, setActiveTab] = useState<ToolbarTab>("format");

  // Math editor state
  const [mathEditorOpen, setMathEditorOpen] = useState(false);
  const [mathEditorLatex, setMathEditorLatex] = useState("");
  const [mathEditorPos, setMathEditorPos] = useState<number | null>(null);
  const [mathEditorType, setMathEditorType] = useState<"inline" | "block">("inline");

  // Geometry editor state
  const [geoEditorOpen, setGeoEditorOpen] = useState(false);
  const [geoEditorState, setGeoEditorState] = useState<GeometryState | null>(null);
  const [geoEditorPos, setGeoEditorPos] = useState<number | null>(null);

  // Page layout state
  const [pageLayoutOpen, setPageLayoutOpen] = useState(false);
  const [docMetadata, setDocMetadata] = useState<DocumentMetadata | null>(doc.page_layout ?? null);

  const handleMetadataSave = useCallback(async (metadata: DocumentMetadata) => {
    setDocMetadata(metadata);
    try {
      await documentsAPI.update(doc.id, { page_layout: metadata });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [doc.id]);

  // Close all dropdown menus
  const closeAllMenus = useCallback(() => {
    setShowColorPicker(false);
    setShowHighlightPicker(false);
    setShowFontSizeMenu(false);
    setShowFontFamilyMenu(false);
    setShowTableMenu(false);
    setShowAlignMenu(false);
    setShowHeadingMenu(false);
  }, []);

  const handleTabSwitch = useCallback((tab: ToolbarTab) => {
    closeAllMenus();
    setActiveTab(tab);
  }, [closeAllMenus]);

  // Click-outside and Escape key to close dropdowns
  const toolbarRef = useRef<HTMLDivElement>(null);
  const anyMenuOpen = showColorPicker || showHighlightPicker || showFontSizeMenu || showFontFamilyMenu || showTableMenu || showAlignMenu || showHeadingMenu;
  useClickOutside(toolbarRef, closeAllMenus, anyMenuOpen);

  useEffect(() => {
    if (!anyMenuOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAllMenus();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [anyMenuOpen, closeAllMenus]);

  const editorInstanceRef = useRef<ReturnType<typeof useEditor>>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isImageUploading, setIsImageUploading] = useState(false);

  // Image upload handler (used by toolbar, paste, and drop)
  const handleImageUpload = useCallback(async (files: File[]) => {
    const ed = editorInstanceRef.current;
    if (!ed) return;
    setIsImageUploading(true);
    try {
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        const result = await documentsAPI.uploadImage(file);
        ed.chain().focus().setImage({ src: result.url, alt: result.filename }).run();
      }
      setSaveState("unsaved");
    } catch (error) {
      console.error("Image upload failed:", error);
    } finally {
      setIsImageUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }, []);

  // Math click handler
  const handleMathClick = useCallback((node: PmNode, pos: number, type: "inline" | "block") => {
    setMathEditorLatex(node.attrs.latex || "");
    setMathEditorType(type);
    setMathEditorPos(pos);
    setMathEditorOpen(true);
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({ placeholder: "Start writing..." }),
      TextStyle,
      Color,
      CustomTextStyles,
      Subscript,
      Superscript,
      Highlight.configure({ multicolor: true }),
      CharacterCount,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "doc-link" } }),
      Mathematics.configure({
        katexOptions: { throwOnError: false },
        inlineOptions: { onClick: (node: PmNode, pos: number) => handleMathClick(node, pos, "inline") },
        blockOptions: { onClick: (node: PmNode, pos: number) => handleMathClick(node, pos, "block") },
      }),
      createMathInputRules(),
      createGeometryDiagramNode({
        onEdit: (graphJson, pos) => {
          try {
            const state: GeometryState = JSON.parse(graphJson);
            setGeoEditorState(state);
          } catch {
            setGeoEditorState(null);
          }
          setGeoEditorPos(pos);
          setGeoEditorOpen(true);
        },
      }),
      ResizableImage.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: { class: "document-image" },
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      PageBreak,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: doc.content || { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          const imageFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
          if (imageFiles.length > 0) {
            event.preventDefault();
            handleImageUpload(imageFiles);
            return true;
          }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          const imageFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
          if (imageFiles.length > 0) {
            event.preventDefault();
            handleImageUpload(imageFiles);
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: () => {
      setSaveState("unsaved");
    },
  });

  useEffect(() => {
    editorInstanceRef.current = editor;
  }, [editor]);

  // Keep dirty ref in sync (avoids stale closures in unmount/beforeunload)
  useEffect(() => {
    isDirtyRef.current = saveState === "unsaved";
  }, [saveState]);

  // Immediate save (used by Ctrl+S, clickable indicator, and auto-save)
  const saveNow = useCallback(async () => {
    const currentEditor = editorInstanceRef.current;
    if (!currentEditor) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState("saving");
    try {
      await documentsAPI.update(doc.id, { content: currentEditor.getJSON() });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [doc.id]);

  // Auto-save with debounce
  useEffect(() => {
    if (saveState !== "unsaved") return;
    const currentEditor = editorInstanceRef.current;
    if (!currentEditor) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        await documentsAPI.update(doc.id, { content: currentEditor.getJSON() });
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, AUTOSAVE_DELAY);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [saveState, doc.id]);

  // Flush pending save on unmount (SPA navigation)
  useEffect(() => {
    return () => {
      if (!isDirtyRef.current) return;
      const currentEditor = editorInstanceRef.current;
      if (!currentEditor) return;
      fetch(`/api/documents/${doc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: currentEditor.getJSON() }),
        credentials: "include",
        keepalive: true,
      });
    };
  }, [doc.id]);

  // Save title on blur (also flush any pending content)
  const handleTitleBlur = useCallback(async () => {
    if (title === doc.title) return;
    try {
      const currentEditor = editorInstanceRef.current;
      const update: { title: string; content?: Record<string, unknown> } = { title };
      if (currentEditor) update.content = currentEditor.getJSON();
      await documentsAPI.update(doc.id, update);
      setSaveState("saved");
      onUpdate();
    } catch { /* ignore */ }
  }, [title, doc.id, doc.title, onUpdate]);

  // Flush save + warn on beforeunload (tab close/refresh)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        const currentEditor = editorInstanceRef.current;
        if (currentEditor) {
          fetch(`/api/documents/${doc.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: currentEditor.getJSON() }),
            credentials: "include",
            keepalive: true,
          });
        }
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [doc.id]);

  // Ctrl+S / Cmd+S keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (isDirtyRef.current) saveNow();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveNow]);

  // Math editor handlers
  const handleMathInsert = useCallback((latex: string, mode: "inline" | "block") => {
    const ed = editorInstanceRef.current;
    if (!ed) return;
    const nodeType = mode === "inline" ? "inlineMath" : "blockMath";
    if (mathEditorPos != null) {
      const node = ed.state.doc.nodeAt(mathEditorPos);
      if (node) {
        ed.chain().focus()
          .command(({ tr }) => {
            tr.replaceWith(mathEditorPos, mathEditorPos + node.nodeSize, ed.schema.nodes[nodeType].create({ latex }));
            return true;
          }).run();
      }
    } else {
      ed.chain().focus()
        .command(({ tr }) => {
          tr.replaceSelectionWith(ed.schema.nodes[nodeType].create({ latex }));
          return true;
        }).run();
    }
    setMathEditorOpen(false);
    setMathEditorLatex("");
    setMathEditorPos(null);
  }, [mathEditorPos]);

  // Geometry editor handlers
  const handleGeoInsert = useCallback((graphJson: string, svgThumbnail: string) => {
    const ed = editorInstanceRef.current;
    if (!ed) return;
    const node = ed.schema.nodes.geometryDiagram.create({
      graphJson,
      svgThumbnail,
    });
    if (geoEditorPos != null) {
      const existing = ed.state.doc.nodeAt(geoEditorPos);
      if (existing) {
        ed.chain().focus().command(({ tr }) => {
          tr.replaceWith(geoEditorPos, geoEditorPos + existing.nodeSize, node);
          return true;
        }).run();
      }
    } else {
      ed.chain().focus().command(({ tr }) => {
        tr.replaceSelectionWith(node);
        return true;
      }).run();
    }
    setGeoEditorOpen(false);
    setGeoEditorState(null);
    setGeoEditorPos(null);
  }, [geoEditorPos]);

  const handleOpenGeoEditor = useCallback(() => {
    setGeoEditorState(null);
    setGeoEditorPos(null);
    setGeoEditorOpen(true);
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // PDF export
  const [pdfExporting, setPdfExporting] = useState(false);
  const [showPdfMenu, setShowPdfMenu] = useState(false);
  const pdfMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPdfMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (pdfMenuRef.current && !pdfMenuRef.current.contains(e.target as Node)) {
        setShowPdfMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPdfMenu]);

  const handleExportPDF = useCallback(async (mode: "preview" | "download") => {
    const ed = editorInstanceRef.current;
    if (!ed) return;
    setShowPdfMenu(false);
    setPdfExporting(true);
    try {
      // Collect geometry diagram attrs from ProseMirror state (raw values, always reliable)
      const geoAttrs: { width: number | null; align: string | null }[] = [];
      ed.state.doc.descendants((node) => {
        if (node.type.name === "geometryDiagram") {
          geoAttrs.push({ width: node.attrs.width ?? null, align: node.attrs.align ?? null });
        }
        return true;
      });
      const html = buildPdfHtml(ed.getHTML(), docMetadata, doc.title, geoAttrs);
      const css = buildPdfExportCSS(docMetadata);
      const blob = await documentsAPI.exportPDF(doc.id, html, css);
      const url = URL.createObjectURL(blob);
      if (mode === "preview") {
        window.open(url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `${doc.title || "document"}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("PDF export failed:", error);
    } finally {
      setPdfExporting(false);
    }
  }, [docMetadata, doc.title, doc.id]);

  // Helper: get current font family label
  const currentFontFamily = editor
    ? FONT_FAMILIES.find(ff => ff.value === editor.getAttributes("textStyle").fontFamily)?.label || "Default"
    : "Default";

  // Helper: get current font size display
  const currentFontSize = editor
    ? (editor.getAttributes("textStyle").fontSize
        ? parseInt(editor.getAttributes("textStyle").fontSize, 10).toString()
        : "16")
    : "16";

  // Helper: get current heading label
  const currentHeading = editor
    ? (editor.isActive("heading", { level: 1 }) ? "Heading 1"
      : editor.isActive("heading", { level: 2 }) ? "Heading 2"
      : editor.isActive("heading", { level: 3 }) ? "Heading 3"
      : "Normal")
    : "Normal";

  // Helper: get current alignment icon
  const CurrentAlignIcon = editor
    ? (editor.isActive({ textAlign: "center" }) ? AlignCenter
      : editor.isActive({ textAlign: "right" }) ? AlignRight
      : AlignLeft)
    : AlignLeft;

  // Dynamic print margins — @page doesn't support CSS custom properties,
  // so we inject computed values via a <style> tag.
  const printMargins = {
    top: docMetadata?.margins?.top ?? 25.4,
    right: docMetadata?.margins?.right ?? 25.4,
    bottom: docMetadata?.margins?.bottom ?? 25.4,
    left: docMetadata?.margins?.left ?? 25.4,
  };
  if (!editor) return null;

  return (
    <div className="flex flex-col h-screen bg-background print:bg-white">
      {/* Dynamic @page margins + margin boxes for {page} counter */}
      <style>{`@media print {
  @page { size: A4; margin: ${printMargins.top}mm ${printMargins.right}mm ${printMargins.bottom}mm ${printMargins.left}mm; ${buildPageMarginCSS(docMetadata, doc.title)} }
}`}</style>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] print:hidden">
        <button
          onClick={() => router.push("/documents")}
          className="p-1.5 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors"
          title="Back to documents"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>

        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setSaveState("unsaved"); }}
          onBlur={handleTitleBlur}
          className="flex-1 text-lg font-semibold bg-transparent text-foreground outline-none border-none"
          placeholder="Untitled Document"
        />

        {/* Save indicator (clickable when unsaved) */}
        <button
          onClick={() => { if (saveState === "unsaved") saveNow(); }}
          className={cn(
            "flex items-center gap-1.5 text-xs text-muted-foreground",
            saveState === "unsaved" && "hover:text-[#a0704b] cursor-pointer"
          )}
          disabled={saveState === "saving"}
          title={saveState === "unsaved" ? "Save now (Ctrl+S)" : undefined}
        >
          {saveState === "saving" && <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>}
          {saveState === "saved" && <><Check className="w-3.5 h-3.5 text-green-600" /> Saved</>}
          {saveState === "unsaved" && <><CloudOff className="w-3.5 h-3.5" /> Unsaved</>}
          {saveState === "error" && <><CloudOff className="w-3.5 h-3.5 text-red-500" /> Error saving</>}
        </button>

        <button
          onClick={() => setPageLayoutOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-foreground hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] border border-[#e8d4b8] dark:border-[#6b5a4a] transition-colors"
          title="Page layout settings"
        >
          <FileSliders className="w-3.5 h-3.5" />
          Layout
        </button>

        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
        >
          <Printer className="w-3.5 h-3.5" />
          Print
        </button>

        {/* Export PDF with dropdown */}
        <div className="relative" ref={pdfMenuRef}>
          <div className="flex items-center">
            <button
              onClick={() => handleExportPDF("preview")}
              disabled={pdfExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg text-sm font-medium text-foreground hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] border border-[#e8d4b8] dark:border-[#6b5a4a] transition-colors disabled:opacity-50"
              title="Export as PDF (opens in new tab)"
            >
              {pdfExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              PDF
            </button>
            <button
              onClick={() => setShowPdfMenu(s => !s)}
              disabled={pdfExporting}
              className="flex items-center px-1.5 py-1.5 rounded-r-lg text-sm font-medium text-foreground hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] border border-l-0 border-[#e8d4b8] dark:border-[#6b5a4a] transition-colors disabled:opacity-50"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
          {showPdfMenu && (
            <div className="absolute top-full right-0 mt-1 z-20 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg p-1 min-w-[10rem]">
              <button
                onClick={() => handleExportPDF("preview")}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-foreground"
              >
                <FileText className="w-3.5 h-3.5" /> Open in new tab
              </button>
              <button
                onClick={() => handleExportPDF("download")}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-foreground"
              >
                <Download className="w-3.5 h-3.5" /> Download PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Toolbar — Tabbed layout */}
      <div ref={toolbarRef} className="border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] print:hidden">
        {/* Tab row: persistent controls + tab switcher + labels toggle */}
        <div className="flex items-center gap-0.5 px-3 py-1 border-b border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40">
          {/* Persistent: Undo/Redo */}
          <ToolbarBtn icon={Undo2} label="Undo" isActive={false} onClick={() => editor.chain().focus().undo().run()} />
          <ToolbarBtn icon={Redo2} label="Redo" isActive={false} onClick={() => editor.chain().focus().redo().run()} />
          <ToolbarSep />

          {/* Tab switcher */}
          <TabButton id="format" label="Format" icon={Type} activeTab={activeTab} onClick={() => handleTabSwitch("format")} />
          <TabButton id="insert" label="Insert" icon={PlusCircle} activeTab={activeTab} onClick={() => handleTabSwitch("insert")} />

          {/* Spacer + Labels toggle */}
          <div className="flex-1" />
          <button
            onClick={() => setShowLabels(s => !s)}
            className={cn(
              "p-1.5 rounded transition-colors",
              showLabels ? "bg-[#a0704b] text-white" : "text-gray-400 dark:text-gray-500 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
            )}
            title={showLabels ? "Hide labels" : "Show labels"}
          >
            <Tags className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tab content row */}
        <div className="flex items-center gap-0.5 px-3 py-1.5 flex-wrap min-h-[32px]">
          {activeTab === "format" && (
            <>
              {/* Font Family dropdown */}
              <div className="relative">
                <button
                  onClick={() => { const next = !showFontFamilyMenu; closeAllMenus(); setShowFontFamilyMenu(next); }}
                  className={cn(
                    "flex items-center gap-1 h-7 px-2 rounded text-xs transition-colors border",
                    showFontFamilyMenu
                      ? "bg-[#a0704b] text-white border-[#a0704b]"
                      : "text-foreground border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
                  )}
                  title="Font Family"
                >
                  <span className="truncate max-w-[7rem]">{currentFontFamily}</span>
                  <ChevronDown className="w-3 h-3 shrink-0" />
                </button>
                {showFontFamilyMenu && (
                  <div className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg p-1 min-w-[10rem] max-h-[20rem] overflow-y-auto">
                    {FONT_FAMILIES.map((ff) => (
                      <button
                        key={ff.label}
                        onClick={() => {
                          if (ff.value) {
                            editor.chain().focus().setMark("textStyle", { fontFamily: ff.value }).run();
                          } else {
                            editor.chain().focus().unsetMark("textStyle").run();
                          }
                          setShowFontFamilyMenu(false);
                        }}
                        className={cn(
                          "w-full text-left px-2 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-foreground",
                          (ff.value === editor.getAttributes("textStyle").fontFamily || (!ff.value && !editor.getAttributes("textStyle").fontFamily)) && "bg-[#f5ede3] dark:bg-[#2d2618] font-semibold"
                        )}
                        style={ff.value ? { fontFamily: ff.value } : undefined}
                      >
                        {ff.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Font Size dropdown */}
              <div className="relative">
                <button
                  onClick={() => { const next = !showFontSizeMenu; closeAllMenus(); setShowFontSizeMenu(next); }}
                  className={cn(
                    "flex items-center gap-1 h-7 px-2 rounded text-xs transition-colors border",
                    showFontSizeMenu
                      ? "bg-[#a0704b] text-white border-[#a0704b]"
                      : "text-foreground border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
                  )}
                  title="Font Size"
                >
                  <span className="w-5 text-center">{currentFontSize}</span>
                  <ChevronDown className="w-3 h-3 shrink-0" />
                </button>
                {showFontSizeMenu && (
                  <div className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg p-1">
                    <div className="grid grid-cols-4 gap-0.5 min-w-[8rem]">
                      {FONT_SIZES.map((fs) => (
                        <button
                          key={fs.label}
                          onClick={() => {
                            if (fs.value) {
                              editor.chain().focus().setMark("textStyle", { fontSize: fs.value }).run();
                            } else {
                              editor.chain().focus().setMark("textStyle", { fontSize: null }).run();
                            }
                            setShowFontSizeMenu(false);
                          }}
                          className={cn(
                            "px-2 py-1 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-foreground text-center",
                            ((fs.value && editor.getAttributes("textStyle").fontSize === fs.value) ||
                             (!fs.value && !editor.getAttributes("textStyle").fontSize)) && "bg-[#f5ede3] dark:bg-[#2d2618] font-semibold"
                          )}
                        >
                          {fs.label}
                        </button>
                      ))}
                    </div>
                    <div className="h-px bg-[#e8d4b8] dark:bg-[#6b5a4a] my-1" />
                    <form
                      className="px-1 py-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const input = (e.target as HTMLFormElement).elements.namedItem("customSize") as HTMLInputElement;
                        const val = parseInt(input.value, 10);
                        if (val >= 8 && val <= 96) {
                          editor.chain().focus().setMark("textStyle", { fontSize: `${val}px` }).run();
                          setShowFontSizeMenu(false);
                        }
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <input
                          name="customSize"
                          type="number"
                          min={8}
                          max={96}
                          placeholder="px"
                          className="w-14 px-1.5 py-0.5 text-xs border border-[#e8d4b8] dark:border-[#6b5a4a] rounded bg-transparent text-foreground outline-none focus:border-[#a0704b]"
                        />
                        <button type="submit" className="text-[10px] text-[#a0704b] hover:underline">Set</button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
              <ToolbarSep />

              {/* Inline formatting */}
              <ToolbarBtn icon={Bold} label="Bold" isActive={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} showLabel={showLabels} />
              <ToolbarBtn icon={Italic} label="Italic" isActive={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} showLabel={showLabels} />
              <ToolbarBtn icon={UnderlineIcon} label="Underline" isActive={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} showLabel={showLabels} />
              <ToolbarBtn icon={Strikethrough} label="Strike" isActive={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} showLabel={showLabels} />
              <ToolbarBtn icon={SubscriptIcon} label="Sub" isActive={editor.isActive("subscript")} onClick={() => editor.chain().focus().toggleSubscript().run()} showLabel={showLabels} />
              <ToolbarBtn icon={SuperscriptIcon} label="Super" isActive={editor.isActive("superscript")} onClick={() => editor.chain().focus().toggleSuperscript().run()} showLabel={showLabels} />
              <ToolbarSep />

              {/* Text color */}
              <div className="relative">
                <button
                  onClick={() => { const next = !showColorPicker; closeAllMenus(); setShowColorPicker(next); }}
                  className={cn(
                    "rounded transition-colors",
                    showLabels ? "flex flex-col items-center gap-0.5 px-2 py-1" : "p-1.5",
                    showColorPicker ? "bg-[#a0704b] text-white" : "text-gray-600 dark:text-gray-400 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
                  )}
                  title="Color"
                >
                  <Palette className="w-4 h-4" />
                  {showLabels && <span className="text-[9px] leading-none">Color</span>}
                </button>
                {showColorPicker && (
                  <div className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg p-2 flex gap-1 items-center">
                    {EDITOR_COLORS.map((c) => (
                      <button
                        key={c.color}
                        onClick={() => editor.chain().focus().setColor(c.color).run()}
                        className="w-6 h-6 rounded-full border border-[#e8d4b8] dark:border-[#6b5a4a] hover:scale-110 transition-transform"
                        style={{ backgroundColor: c.color }}
                        title={c.label}
                      />
                    ))}
                    <button
                      onClick={() => editor.chain().focus().unsetColor().run()}
                      className="w-6 h-6 rounded-full border border-[#e8d4b8] dark:border-[#6b5a4a] hover:scale-110 transition-transform flex items-center justify-center text-xs text-muted-foreground"
                      title="Remove color"
                    >
                      &times;
                    </button>
                    <input
                      type="color"
                      value={editor.getAttributes("textStyle").color || "#000000"}
                      onInput={(e) => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
                      onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
                      className="doc-color-swatch w-6 h-6 rounded-full hover:scale-110 transition-transform"
                      title="Custom color"
                    />
                  </div>
                )}
              </div>

              {/* Highlight */}
              <div className="relative">
                <button
                  onClick={() => { const next = !showHighlightPicker; closeAllMenus(); setShowHighlightPicker(next); }}
                  className={cn(
                    "rounded transition-colors",
                    showLabels ? "flex flex-col items-center gap-0.5 px-2 py-1" : "p-1.5",
                    showHighlightPicker || editor.isActive("highlight") ? "bg-[#a0704b] text-white" : "text-gray-600 dark:text-gray-400 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
                  )}
                  title="Highlight"
                >
                  <Highlighter className="w-4 h-4" />
                  {showLabels && <span className="text-[9px] leading-none">Highlight</span>}
                </button>
                {showHighlightPicker && (
                  <div className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg p-2 flex gap-1 items-center">
                    {HIGHLIGHT_COLORS.map((c) => (
                      <button
                        key={c.color}
                        onClick={() => editor.chain().focus().toggleHighlight({ color: c.color }).run()}
                        className="w-6 h-6 rounded-full border border-[#e8d4b8] dark:border-[#6b5a4a] hover:scale-110 transition-transform"
                        style={{ backgroundColor: c.color }}
                        title={c.label}
                      />
                    ))}
                    <button
                      onClick={() => editor.chain().focus().unsetHighlight().run()}
                      className="w-6 h-6 rounded-full border border-[#e8d4b8] dark:border-[#6b5a4a] hover:scale-110 transition-transform flex items-center justify-center text-xs text-muted-foreground"
                      title="Remove highlight"
                    >
                      &times;
                    </button>
                    <input
                      type="color"
                      defaultValue="#fef08a"
                      onInput={(e) => editor.chain().focus().toggleHighlight({ color: (e.target as HTMLInputElement).value }).run()}
                      onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()}
                      className="doc-color-swatch w-6 h-6 rounded-full hover:scale-110 transition-transform"
                      title="Custom highlight color"
                    />
                  </div>
                )}
              </div>
              <ToolbarSep />

              {/* Alignment dropdown */}
              <div className="relative">
                <button
                  onClick={() => { const next = !showAlignMenu; closeAllMenus(); setShowAlignMenu(next); }}
                  className={cn(
                    "rounded transition-colors",
                    showLabels ? "flex flex-col items-center gap-0.5 px-2 py-1" : "flex items-center gap-0.5 p-1.5",
                    showAlignMenu ? "bg-[#a0704b] text-white" : "text-gray-600 dark:text-gray-400 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
                  )}
                  title="Align"
                >
                  <div className="flex items-center gap-0.5">
                    <CurrentAlignIcon className="w-4 h-4" />
                    <ChevronDown className="w-3 h-3" />
                  </div>
                  {showLabels && <span className="text-[9px] leading-none">Align</span>}
                </button>
                {showAlignMenu && (
                  <div className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg p-1 min-w-[8rem]">
                    {ALIGN_OPTIONS.map((item) => (
                      <button
                        key={item.value}
                        onClick={() => { editor.chain().focus().setTextAlign(item.value).run(); setShowAlignMenu(false); }}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-foreground",
                          editor.isActive({ textAlign: item.value }) && "bg-[#f5ede3] dark:bg-[#2d2618] font-semibold"
                        )}
                      >
                        <item.icon className="w-4 h-4" /> {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === "insert" && (
            <>
              {/* Heading dropdown */}
              <div className="relative">
                <button
                  onClick={() => { const next = !showHeadingMenu; closeAllMenus(); setShowHeadingMenu(next); }}
                  className={cn(
                    "flex items-center gap-1 h-7 px-2 rounded text-xs transition-colors border",
                    showHeadingMenu
                      ? "bg-[#a0704b] text-white border-[#a0704b]"
                      : "text-foreground border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
                  )}
                  title="Heading Level"
                >
                  <span className="min-w-[4.5rem]">{currentHeading}</span>
                  <ChevronDown className="w-3 h-3 shrink-0" />
                </button>
                {showHeadingMenu && (
                  <div className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg p-1 min-w-[10rem]">
                    {HEADING_OPTIONS.map((h) => (
                      <button
                        key={h.label}
                        onClick={() => {
                          if (h.level) {
                            editor.chain().focus().toggleHeading({ level: h.level }).run();
                          } else {
                            editor.chain().focus().setParagraph().run();
                          }
                          setShowHeadingMenu(false);
                        }}
                        className={cn(
                          "w-full text-left px-2 py-1.5 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-foreground",
                          h.className,
                          (h.level ? editor.isActive("heading", { level: h.level }) : !editor.isActive("heading")) && "bg-[#f5ede3] dark:bg-[#2d2618]"
                        )}
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <ToolbarSep />

              {/* Lists */}
              <ToolbarBtn icon={List} label="Bullet" isActive={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} showLabel={showLabels} />
              <ToolbarBtn icon={ListOrdered} label="Ordered" isActive={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} showLabel={showLabels} />
              <ToolbarSep />

              {/* Block types */}
              <ToolbarBtn icon={TextQuote} label="Quote" isActive={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} showLabel={showLabels} />
              <ToolbarBtn icon={Code} label="Code" isActive={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} showLabel={showLabels} />
              <ToolbarBtn icon={SeparatorHorizontal} label="Divider" isActive={false} onClick={() => editor.chain().focus().setHorizontalRule().run()} showLabel={showLabels} />
              <ToolbarBtn icon={ScissorsLineDashed} label="Page Break" isActive={false} onClick={() => editor.chain().focus().setPageBreak().run()} showLabel={showLabels} />
              <ToolbarSep />

              {/* Link */}
              <ToolbarBtn
                icon={editor.isActive("link") ? Unlink : LinkIcon}
                label={editor.isActive("link") ? "Unlink" : "Link"}
                isActive={editor.isActive("link")}
                onClick={() => {
                  if (editor.isActive("link")) {
                    editor.chain().focus().unsetLink().run();
                  } else {
                    const url = window.prompt("Enter URL:");
                    if (url) editor.chain().focus().setLink({ href: url }).run();
                  }
                }}
                showLabel={showLabels}
              />
              <ToolbarSep />

              {/* Insert elements */}
              <ToolbarBtn
                icon={Sigma}
                label="Math"
                isActive={false}
                onClick={() => { setMathEditorLatex(""); setMathEditorType("inline"); setMathEditorPos(null); setMathEditorOpen(true); }}
                showLabel={showLabels}
              />
              <ToolbarBtn
                icon={Hexagon}
                label="Geometry"
                isActive={false}
                onClick={handleOpenGeoEditor}
                showLabel={showLabels}
              />
              <ToolbarBtn
                icon={ImageIcon}
                label="Image"
                isActive={false}
                onClick={() => imageInputRef.current?.click()}
                showLabel={showLabels}
              />
              {isImageUploading && <Loader2 className="w-4 h-4 animate-spin text-[#a0704b] ml-1" />}

              {/* Table menu */}
              <div className="relative">
                <button
                  onClick={() => { const next = !showTableMenu; closeAllMenus(); setShowTableMenu(next); }}
                  className={cn(
                    "rounded transition-colors",
                    showLabels ? "flex flex-col items-center gap-0.5 px-2 py-1" : "p-1.5",
                    showTableMenu || editor.isActive("table")
                      ? "bg-[#a0704b] text-white"
                      : "text-gray-600 dark:text-gray-400 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
                  )}
                  title="Table"
                >
                  <Grid3X3 className="w-4 h-4" />
                  {showLabels && <span className="text-[9px] leading-none">Table</span>}
                </button>
                {showTableMenu && (
                  <div className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg p-2" style={{ width: "12rem" }}>
                    {editor.isActive("table") ? (
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => { editor.chain().focus().addRowBefore().run(); setShowTableMenu(false); }} className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-foreground">
                          <Plus className="w-3 h-3" /> Add row above
                        </button>
                        <button onClick={() => { editor.chain().focus().addRowAfter().run(); setShowTableMenu(false); }} className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-foreground">
                          <Plus className="w-3 h-3" /> Add row below
                        </button>
                        <button onClick={() => { editor.chain().focus().addColumnBefore().run(); setShowTableMenu(false); }} className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-foreground">
                          <Plus className="w-3 h-3" /> Add column left
                        </button>
                        <button onClick={() => { editor.chain().focus().addColumnAfter().run(); setShowTableMenu(false); }} className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-foreground">
                          <Plus className="w-3 h-3" /> Add column right
                        </button>
                        <div className="h-px bg-[#e8d4b8] dark:bg-[#6b5a4a] my-1" />
                        <button onClick={() => { editor.chain().focus().deleteRow().run(); setShowTableMenu(false); }} className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-foreground">
                          <Minus className="w-3 h-3" /> Delete row
                        </button>
                        <button onClick={() => { editor.chain().focus().deleteColumn().run(); setShowTableMenu(false); }} className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-foreground">
                          <Minus className="w-3 h-3" /> Delete column
                        </button>
                        <button onClick={() => { editor.chain().focus().toggleHeaderRow().run(); setShowTableMenu(false); }} className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-foreground">
                          <ToggleLeft className="w-3 h-3" /> Toggle header row
                        </button>
                        <div className="h-px bg-[#e8d4b8] dark:bg-[#6b5a4a] my-1" />
                        <button onClick={() => { editor.chain().focus().deleteTable().run(); setShowTableMenu(false); }} className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600">
                          <Trash2 className="w-3 h-3" /> Delete table
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1.5 px-0.5">
                          {gridHover ? `${gridHover.rows} × ${gridHover.cols}` : "Insert table"}
                        </p>
                        <div
                          className="grid gap-[3px]"
                          style={{ gridTemplateColumns: "repeat(5, 1fr)" }}
                          onMouseLeave={() => setGridHover(null)}
                        >
                          {Array.from({ length: 25 }, (_, i) => {
                            const row = Math.floor(i / 5) + 1;
                            const col = (i % 5) + 1;
                            const active = gridHover && row <= gridHover.rows && col <= gridHover.cols;
                            return (
                              <button
                                key={i}
                                type="button"
                                className={cn(
                                  "w-5 h-5 rounded-sm border transition-colors",
                                  active
                                    ? "bg-[#a0704b] border-[#a0704b]"
                                    : "border-[#e8d4b8] dark:border-[#6b5a4a] hover:border-[#a0704b]/50"
                                )}
                                onMouseEnter={() => setGridHover({ rows: row, cols: col })}
                                onClick={() => {
                                  editor.chain().focus().insertTable({ rows: row, cols: col, withHeaderRow: true }).run();
                                  setShowTableMenu(false);
                                  setGridHover(null);
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Editor area — A4 page styling */}
      <div className="flex-1 overflow-y-auto bg-[#f0e8dc] dark:bg-[#0d0d0d] print:bg-white print:overflow-visible">
        <div className="py-8 px-4 print:p-0 print:m-0">
          <div
            ref={pageRef}
            className={cn(
              "relative mx-auto bg-white dark:bg-[#2a2420] shadow-lg print:shadow-none",
              "border border-gray-200 dark:border-[#4a3a2a] print:border-none",
              "document-page"
            )}
            style={{
              width: "210mm",
              minHeight: "297mm",
              padding: `${docMetadata?.margins?.top ?? 25.4}mm ${docMetadata?.margins?.right ?? 25.4}mm ${docMetadata?.margins?.bottom ?? 25.4}mm ${docMetadata?.margins?.left ?? 25.4}mm`,
              maxWidth: "100%",
              ["--doc-margin-top" as string]: `${docMetadata?.margins?.top ?? 25.4}mm`,
              ["--doc-margin-right" as string]: `${docMetadata?.margins?.right ?? 25.4}mm`,
              ["--doc-margin-bottom" as string]: `${docMetadata?.margins?.bottom ?? 25.4}mm`,
              ["--doc-margin-left" as string]: `${docMetadata?.margins?.left ?? 25.4}mm`,
            }}
          >
            {/* Watermark overlay */}
            {docMetadata?.watermark?.enabled && (
              docMetadata.watermark.type === "text" && docMetadata.watermark.text ? (
                <span
                  className="document-watermark"
                  style={{
                    position: "absolute", top: "148.5mm", left: "50%",
                    transform: "translate(-50%, -50%) rotate(-45deg)",
                    pointerEvents: "none", zIndex: 0,
                    fontSize: "80px", fontWeight: "bold", color: "#000",
                    whiteSpace: "nowrap", userSelect: "none",
                    opacity: docMetadata.watermark.opacity,
                  }}
                >
                  {docMetadata.watermark.text}
                </span>
              ) : docMetadata.watermark.type === "image" && docMetadata.watermark.imageUrl ? (
                <img
                  src={docMetadata.watermark.imageUrl}
                  alt=""
                  className="document-watermark-image"
                  style={{
                    position: "absolute", top: "148.5mm", left: "50%",
                    transform: "translate(-50%, -50%)",
                    pointerEvents: "none", zIndex: 0,
                    maxWidth: `${docMetadata.watermark.imageSize ?? 60}%`, maxHeight: `${docMetadata.watermark.imageSize ?? 60}%`, userSelect: "none",
                    opacity: docMetadata.watermark.opacity,
                  }}
                />
              ) : null
            )}

            {/* Print header — outer div becomes table-header-group in print, inner div keeps flex */}
            {docMetadata?.header?.enabled && (
              <div className={cn("document-print-header", sectionShouldHideEntirely(docMetadata.header) && "print-hide-page-section")}>
                <div
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    fontSize: "9px", color: "#888",
                    pointerEvents: "none", userSelect: "none",
                    paddingBottom: "4px", borderBottom: "0.5px solid #ddd",
                    marginBottom: "1em",
                  }}
                >
                  <span style={{ flex: 1 }} className={docMetadata.header.left?.includes("{page}") ? "print-hide-page-cell" : undefined}>
                    {docMetadata.header.imageUrl && docMetadata.header.imagePosition === "left" && (
                      <img src={docMetadata.header.imageUrl} alt="" className="document-hf-image" style={{ maxHeight: "10mm", width: "auto", display: "inline-block", verticalAlign: "middle", marginRight: "4px" }} />
                    )}
                    {renderHeaderFooterContent(docMetadata.header.left, doc.title)}
                  </span>
                  <span style={{ flex: 1, textAlign: "center" }} className={docMetadata.header.center?.includes("{page}") ? "print-hide-page-cell" : undefined}>
                    {docMetadata.header.imageUrl && docMetadata.header.imagePosition === "center" && (
                      <img src={docMetadata.header.imageUrl} alt="" className="document-hf-image" style={{ maxHeight: "10mm", width: "auto", display: "inline-block", verticalAlign: "middle", marginRight: "4px" }} />
                    )}
                    {renderHeaderFooterContent(docMetadata.header.center, doc.title)}
                  </span>
                  <span style={{ flex: 1, textAlign: "right" }} className={docMetadata.header.right?.includes("{page}") ? "print-hide-page-cell" : undefined}>
                    {renderHeaderFooterContent(docMetadata.header.right, doc.title)}
                    {docMetadata.header.imageUrl && docMetadata.header.imagePosition === "right" && (
                      <img src={docMetadata.header.imageUrl} alt="" className="document-hf-image" style={{ maxHeight: "10mm", width: "auto", display: "inline-block", verticalAlign: "middle", marginLeft: "4px" }} />
                    )}
                  </span>
                </div>
              </div>
            )}

            <EditorContent
              editor={editor}
              className="document-editor-content prose prose-sm dark:prose-invert max-w-none"
            />
            <PageBreakOverlay containerRef={pageRef} />

            {/* Print footer — position:fixed in print for per-page repetition, inner div keeps flex */}
            {docMetadata?.footer?.enabled && (
              <div className={cn("document-print-footer", sectionShouldHideEntirely(docMetadata.footer) && "print-hide-page-section")}>
                <div
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    fontSize: "9px", color: "#888",
                    pointerEvents: "none", userSelect: "none",
                    paddingTop: "4px", borderTop: "0.5px solid #ddd",
                  }}
                >
                  <span style={{ flex: 1 }} className={docMetadata.footer.left?.includes("{page}") ? "print-hide-page-cell" : undefined}>
                    {docMetadata.footer.imageUrl && docMetadata.footer.imagePosition === "left" && (
                      <img src={docMetadata.footer.imageUrl} alt="" className="document-hf-image" style={{ maxHeight: "10mm", width: "auto", display: "inline-block", verticalAlign: "middle", marginRight: "4px" }} />
                    )}
                    {renderHeaderFooterContent(docMetadata.footer.left, doc.title)}
                  </span>
                  <span style={{ flex: 1, textAlign: "center" }} className={docMetadata.footer.center?.includes("{page}") ? "print-hide-page-cell" : undefined}>
                    {docMetadata.footer.imageUrl && docMetadata.footer.imagePosition === "center" && (
                      <img src={docMetadata.footer.imageUrl} alt="" className="document-hf-image" style={{ maxHeight: "10mm", width: "auto", display: "inline-block", verticalAlign: "middle", marginRight: "4px" }} />
                    )}
                    {renderHeaderFooterContent(docMetadata.footer.center, doc.title)}
                  </span>
                  <span style={{ flex: 1, textAlign: "right" }} className={docMetadata.footer.right?.includes("{page}") ? "print-hide-page-cell" : undefined}>
                    {renderHeaderFooterContent(docMetadata.footer.right, doc.title)}
                    {docMetadata.footer.imageUrl && docMetadata.footer.imagePosition === "right" && (
                      <img src={docMetadata.footer.imageUrl} alt="" className="document-hf-image" style={{ maxHeight: "10mm", width: "auto", display: "inline-block", verticalAlign: "middle", marginLeft: "4px" }} />
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Word count status bar */}
      <div className="flex items-center justify-end px-4 py-1 border-t border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-xs text-muted-foreground print:hidden">
        {editor.storage.characterCount.words()} words &middot; {editor.storage.characterCount.characters()} characters
      </div>

      {/* Math editor modal */}
      {mathEditorOpen && (
        <MathEditorModal
          isOpen={mathEditorOpen}
          onClose={() => { setMathEditorOpen(false); setMathEditorLatex(""); setMathEditorPos(null); }}
          onInsert={handleMathInsert}
          initialLatex={mathEditorLatex}
          initialMode={mathEditorType}
        />
      )}

      {/* Geometry editor modal */}
      {geoEditorOpen && (
        <GeometryEditorModal
          isOpen={geoEditorOpen}
          onClose={() => { setGeoEditorOpen(false); setGeoEditorState(null); setGeoEditorPos(null); }}
          onInsert={handleGeoInsert}
          initialState={geoEditorState}
        />
      )}

      {/* Hidden file input for image upload */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleImageUpload(Array.from(e.target.files));
        }}
      />

      {/* Page layout modal */}
      {pageLayoutOpen && (
        <PageLayoutModal
          isOpen={pageLayoutOpen}
          onClose={() => setPageLayoutOpen(false)}
          metadata={docMetadata}
          onSave={handleMetadataSave}
          docId={doc.id}
        />
      )}
    </div>
  );
}

/* Page-break overlay — dashed lines at 297mm intervals */
const A4_HEIGHT_MM = 297;

function PageBreakOverlay({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [pageCount, setPageCount] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Convert 297mm to px using a temporary element
    const probe = document.createElement("div");
    probe.style.width = `${A4_HEIGHT_MM}mm`;
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    el.appendChild(probe);
    const pageHeightPx = probe.offsetWidth; // width set in mm, read as px
    el.removeChild(probe);
    if (!pageHeightPx) return;

    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? 0;
      setPageCount(Math.max(1, Math.ceil(height / pageHeightPx)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  if (pageCount <= 1) return null;

  return (
    <>
      {Array.from({ length: pageCount - 1 }, (_, i) => (
        <div
          key={i}
          className="absolute left-0 right-0 z-10 pointer-events-none print:hidden flex items-center"
          style={{ top: `${(i + 1) * A4_HEIGHT_MM}mm` }}
        >
          <div className="flex-1 border-t border-dashed border-[#c4b5a3] dark:border-[#6b5a4a]" />
          <span className="px-2 text-[10px] text-[#c4b5a3] dark:text-[#6b5a4a] select-none">
            Page {i + 2}
          </span>
          <div className="flex-1 border-t border-dashed border-[#c4b5a3] dark:border-[#6b5a4a]" />
        </div>
      ))}
    </>
  );
}

/* Tab button for toolbar tab switcher */
function TabButton({ id, label, icon: Icon, activeTab, onClick }: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeTab: string;
  onClick: () => void;
}) {
  const isActive = activeTab === id;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-3 py-1 text-xs font-medium transition-colors border-b-2",
        isActive
          ? "text-[#a0704b] border-[#a0704b]"
          : "text-gray-500 dark:text-gray-400 border-transparent hover:text-[#a0704b]"
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

/* Toolbar separator */
function ToolbarSep() {
  return <div className="w-px h-5 bg-[#e8d4b8] dark:bg-[#6b5a4a] mx-1 shrink-0" />;
}

/* Toolbar button with optional label */
function ToolbarBtn({ icon: Icon, label, isActive, onClick, showLabel }: { icon: React.ComponentType<{ className?: string }>; label: string; isActive: boolean; onClick: () => void; showLabel?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded transition-colors",
        showLabel ? "flex flex-col items-center gap-0.5 px-2 py-1" : "p-1.5",
        isActive
          ? "bg-[#a0704b] text-white"
          : "text-gray-600 dark:text-gray-400 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
      )}
      title={label}
    >
      <Icon className="w-4 h-4" />
      {showLabel && <span className="text-[9px] leading-none">{label}</span>}
    </button>
  );
}
