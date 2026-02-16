"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Mathematics } from "@tiptap/extension-mathematics";
import Image from "@tiptap/extension-image";
import type { Node as PmNode } from "@tiptap/pm/model";
import { createMathInputRules, createGeometryDiagramNode } from "@/lib/tiptap-extensions";
import "katex/dist/katex.min.css";
import {
  ArrowLeft,
  Bold,
  Italic,
  Strikethrough,
  Heading,
  List,
  ListOrdered,
  TextQuote,
  Code,
  Palette,
  Sigma,
  Hexagon,
  Image as ImageIcon,
  Printer,
  Check,
  Loader2,
  CloudOff,
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
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorButtonRef = useRef<HTMLButtonElement>(null);

  // Math editor state
  const [mathEditorOpen, setMathEditorOpen] = useState(false);
  const [mathEditorLatex, setMathEditorLatex] = useState("");
  const [mathEditorPos, setMathEditorPos] = useState<number | null>(null);
  const [mathEditorType, setMathEditorType] = useState<"inline" | "block">("inline");

  // Geometry editor state
  const [geoEditorOpen, setGeoEditorOpen] = useState(false);
  const [geoEditorState, setGeoEditorState] = useState<GeometryState | null>(null);
  const [geoEditorPos, setGeoEditorPos] = useState<number | null>(null);

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
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder: "Start writing..." }),
      TextStyle,
      Color,
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

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] print:hidden">
        <ToolbarBtn icon={Bold} label="Bold" isActive={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarBtn icon={Italic} label="Italic" isActive={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolbarBtn icon={Strikethrough} label="Strikethrough" isActive={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} />
        <div className="w-px h-5 bg-[#e8d4b8] dark:bg-[#6b5a4a] mx-1" />
        <ToolbarBtn
          icon={Heading}
          label="Heading"
          isActive={editor.isActive("heading")}
          onClick={() => {
            if (editor.isActive("heading", { level: 1 })) editor.chain().focus().toggleHeading({ level: 2 }).run();
            else if (editor.isActive("heading", { level: 2 })) editor.chain().focus().toggleHeading({ level: 3 }).run();
            else if (editor.isActive("heading", { level: 3 })) editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level: 1 }).run();
          }}
        />
        <ToolbarBtn icon={List} label="Bullet List" isActive={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolbarBtn icon={ListOrdered} label="Ordered List" isActive={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolbarBtn icon={TextQuote} label="Blockquote" isActive={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolbarBtn icon={Code} label="Code" isActive={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} />
        <div className="w-px h-5 bg-[#e8d4b8] dark:bg-[#6b5a4a] mx-1" />

        {/* Color picker */}
        <div className="relative">
          <button
            ref={colorButtonRef}
            onClick={() => setShowColorPicker(!showColorPicker)}
            className={cn(
              "p-1.5 rounded transition-colors",
              showColorPicker ? "bg-[#a0704b] text-white" : "text-gray-600 dark:text-gray-400 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
            )}
            title="Text Color"
          >
            <Palette className="w-4 h-4" />
          </button>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg p-2 flex gap-1">
              {EDITOR_COLORS.map((c) => (
                <button
                  key={c.color}
                  onClick={() => { editor.chain().focus().setColor(c.color).run(); setShowColorPicker(false); }}
                  className="w-6 h-6 rounded-full border border-[#e8d4b8] dark:border-[#6b5a4a] hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.color }}
                  title={c.label}
                />
              ))}
              <button
                onClick={() => { editor.chain().focus().unsetColor().run(); setShowColorPicker(false); }}
                className="w-6 h-6 rounded-full border border-[#e8d4b8] dark:border-[#6b5a4a] hover:scale-110 transition-transform flex items-center justify-center text-xs text-muted-foreground"
                title="Remove color"
              >
                &times;
              </button>
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-[#e8d4b8] dark:bg-[#6b5a4a] mx-1" />
        <ToolbarBtn
          icon={Sigma}
          label="Math Equation"
          isActive={false}
          onClick={() => { setMathEditorLatex(""); setMathEditorType("inline"); setMathEditorPos(null); setMathEditorOpen(true); }}
        />
        <ToolbarBtn
          icon={Hexagon}
          label="Geometry Diagram"
          isActive={false}
          onClick={handleOpenGeoEditor}
        />
        <ToolbarBtn
          icon={ImageIcon}
          label="Insert Image"
          isActive={false}
          onClick={() => imageInputRef.current?.click()}
        />
        {isImageUploading && <Loader2 className="w-4 h-4 animate-spin text-[#a0704b] ml-1" />}
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

/* Small toolbar button */
function ToolbarBtn({ icon: Icon, label, isActive, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; isActive: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "p-1.5 rounded transition-colors",
        isActive
          ? "bg-[#a0704b] text-white"
          : "text-gray-600 dark:text-gray-400 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
      )}
      title={label}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
