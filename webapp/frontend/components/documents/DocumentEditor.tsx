"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Mathematics } from "@tiptap/extension-mathematics";
import Image from "@tiptap/extension-image";
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
import { createMathInputRules, createGeometryDiagramNode } from "@/lib/tiptap-extensions";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { documentsAPI } from "@/lib/document-api";
import MathEditorModal from "@/components/inbox/MathEditorModal";
import GeometryEditorModal from "@/components/inbox/GeometryEditorModal";
import type { GeometryState } from "@/lib/geometry-utils";
import type { Document } from "@/types";

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

interface DocumentEditorProps {
  document: Document;
  onUpdate: () => void;
}

export function DocumentEditor({ document: doc, onUpdate }: DocumentEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(doc.title);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: { class: "document-image" },
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
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

  // Warn before unload if unsaved
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saveState === "unsaved") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveState]);

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

  if (!editor) return null;

  return (
    <div className="flex flex-col h-screen bg-background print:bg-white">
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

        {/* Save indicator */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {saveState === "saving" && <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>}
          {saveState === "saved" && <><Check className="w-3.5 h-3.5 text-green-600" /> Saved</>}
          {saveState === "error" && <><CloudOff className="w-3.5 h-3.5 text-red-500" /> Error saving</>}
        </div>

        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
        >
          <Printer className="w-3.5 h-3.5" />
          Print
        </button>
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
              padding: "25.4mm",
              maxWidth: "100%",
            }}
          >
            <EditorContent
              editor={editor}
              className="document-editor-content prose prose-sm dark:prose-invert max-w-none"
            />
            <PageBreakOverlay containerRef={pageRef} />
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
          className="absolute left-0 right-0 pointer-events-none print:hidden flex items-center"
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
