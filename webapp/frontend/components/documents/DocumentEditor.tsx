"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
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
import { createMathInputRules, createGeometryDiagramNode, ResizableImage, PageBreak, AnswerSection, PaginationExtension, paginationPluginKey, SearchAndReplace, buildHFontFamily } from "@/lib/tiptap-extensions";
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
  KeyRound,
  Search,
  Replace,
  X,
  Keyboard,
  ArrowDown,
  ArrowUp,
  Sun,
  Moon,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { documentsAPI } from "@/lib/document-api";
import { useAuth } from "@/contexts/AuthContext";
import MathEditorModal from "@/components/inbox/MathEditorModal";
import GeometryEditorModal from "@/components/inbox/GeometryEditorModal";
import type { GeometryState } from "@/lib/geometry-utils";
import { PageLayoutModal } from "@/components/documents/PageLayoutModal";
import type { Document, DocumentMetadata } from "@/types";
import { PageHeader } from "@/components/documents/PageHeader";
import { PageFooter } from "@/components/documents/PageFooter";

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
  const { user, isAdmin } = useAuth();
  const [title, setTitle] = useState(doc.title);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);

  // ─── Document Locking ──────────────────────────────────────────────
  const HEARTBEAT_INTERVAL = 2 * 60 * 1000; // 2 minutes
  const [lockedByOther, setLockedByOther] = useState<string | null>(() => {
    // If already locked by someone else on initial load, start in read-only
    if (doc.locked_by && doc.locked_by !== user?.id && doc.lock_expires_at) {
      const expires = new Date(doc.lock_expires_at);
      if (expires > new Date()) return doc.locked_by_name || "another user";
    }
    return null;
  });
  const lockAcquiredRef = useRef(false);

  // Acquire lock on mount, release on unmount
  useEffect(() => {
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const acquireLock = async () => {
      try {
        await documentsAPI.lock(doc.id);
        lockAcquiredRef.current = true;
        setLockedByOther(null);

        // Start heartbeat
        heartbeatTimer = setInterval(async () => {
          try {
            await documentsAPI.heartbeat(doc.id);
          } catch {
            // Lost lock (expired or stolen)
            lockAcquiredRef.current = false;
            setLockedByOther("another user");
            if (heartbeatTimer) clearInterval(heartbeatTimer);
          }
        }, HEARTBEAT_INTERVAL);
      } catch (err: unknown) {
        // 409 = locked by another user
        const msg = err instanceof Error ? err.message : "another user";
        setLockedByOther(msg.replace("Document is locked by ", ""));
      }
    };

    acquireLock();

    return () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (lockAcquiredRef.current) {
        // Release lock on unmount — keepalive survives tab close
        fetch(`/api/documents/${doc.id}/lock`, {
          method: "DELETE",
          credentials: "include",
          keepalive: true,
        });
        lockAcquiredRef.current = false;
      }
    };
  }, [doc.id]);

  // Re-acquire lock when tab becomes visible after being hidden
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === "visible" && !lockAcquiredRef.current) {
        try {
          await documentsAPI.lock(doc.id);
          lockAcquiredRef.current = true;
          setLockedByOther(null);
        } catch {
          // Still locked by someone else
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [doc.id]);

  const isReadOnly = lockedByOther !== null;

  const handleForceUnlock = useCallback(async () => {
    try {
      await documentsAPI.unlock(doc.id);
      await documentsAPI.lock(doc.id);
      lockAcquiredRef.current = true;
      setLockedByOther(null);
    } catch {
      // Failed to take over
    }
  }, [doc.id]);

  // Dropdown states — only one toolbar menu can be open at a time
  type MenuId = "color" | "highlight" | "fontSize" | "fontFamily" | "table" | "align" | "heading" | null;
  const [activeMenu, setActiveMenu] = useState<MenuId>(null);
  const toggleMenu = (id: MenuId) => setActiveMenu(prev => prev === id ? null : id);
  const [gridHover, setGridHover] = useState<{ rows: number; cols: number } | null>(null);

  // Find & Replace
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const findInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts modal
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  // Paper mode: document content always in light/print colors
  const [paperMode, setPaperMode] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("doc-paper-mode") !== "false";
  });
  useEffect(() => {
    localStorage.setItem("doc-paper-mode", String(paperMode));
  }, [paperMode]);

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
    setActiveMenu(null);
  }, []);

  const handleTabSwitch = useCallback((tab: ToolbarTab) => {
    closeAllMenus();
    setActiveTab(tab);
  }, [closeAllMenus]);

  // Click-outside and Escape key to close dropdowns
  const toolbarRef = useRef<HTMLDivElement>(null);
  const anyMenuOpen = activeMenu !== null;
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isImageUploading, setIsImageUploading] = useState(false);

  // Zoom control: "fit" = auto-fit to viewport width, or a specific number
  const [fitScale, setFitScale] = useState(1);
  const [zoomLevel, setZoomLevel] = useState<number | "fit">("fit");
  const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
  const effectiveZoom = zoomLevel === "fit" ? Math.min(fitScale, 1) : zoomLevel;

  const zoomIn = useCallback(() => {
    const current = effectiveZoom;
    const next = ZOOM_STEPS.find((s) => s > current + 0.01);
    if (next) setZoomLevel(next);
  }, [effectiveZoom]);

  const zoomOut = useCallback(() => {
    const current = effectiveZoom;
    const prev = [...ZOOM_STEPS].reverse().find((s) => s < current - 0.01);
    if (prev) setZoomLevel(prev);
  }, [effectiveZoom]);

  // Keyboard shortcuts: Ctrl+=/- for zoom, Ctrl+0 for fit, Ctrl+F for find, Ctrl+/ for shortcuts
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        if (e.key === "=" || e.key === "+") { e.preventDefault(); zoomIn(); }
        else if (e.key === "-") { e.preventDefault(); zoomOut(); }
        else if (e.key === "0") { e.preventDefault(); setZoomLevel("fit"); }
        else if (e.key === "f") {
          e.preventDefault();
          setShowFindReplace(true);
          setTimeout(() => findInputRef.current?.focus(), 50);
        }
        else if (e.key === "/") { e.preventDefault(); setShowShortcutsModal(s => !s); }
      }
      if (e.key === "Escape") {
        if (showFindReplace) { setShowFindReplace(false); setSearchTerm(""); editorInstanceRef.current?.commands.clearSearch(); }
        if (showShortcutsModal) setShowShortcutsModal(false);
      }
    };
    document.addEventListener("keydown", handleGlobalKeys);
    return () => document.removeEventListener("keydown", handleGlobalKeys);
  }, [zoomIn, zoomOut, showFindReplace, showShortcutsModal]);

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
    editable: !isReadOnly,
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
      AnswerSection,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      PaginationExtension.configure({
        metadata: doc.page_layout ?? null,
        docTitle: doc.title,
      }),
      SearchAndReplace,
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

  // Update editor editability when lock status changes
  useEffect(() => {
    if (editor) editor.setEditable(!isReadOnly);
  }, [editor, isReadOnly]);

  // Auto-calculate fit-to-width scale
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      const pageWidthPx = 210 * (96 / 25.4); // ~793px at 96dpi
      const padding = 32; // px-4 = 16px each side
      setFitScale((width - padding) / pageWidthPx);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [editor]);

  // Update pagination plugin when metadata or title changes
  // Debounce title to avoid expensive DOM measurement on every keystroke
  const [debouncedTitle, setDebouncedTitle] = useState(title);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTitle(title), 300);
    return () => clearTimeout(t);
  }, [title]);

  useEffect(() => {
    if (!editor) return;
    const { tr } = editor.state;
    tr.setMeta(paginationPluginKey, { metadata: docMetadata, docTitle: debouncedTitle });
    tr.setMeta("addToHistory", false);
    editor.view.dispatch(tr);
  }, [editor, docMetadata, debouncedTitle]);

  // Trigger pagination recalculation when content images load (NOT decoration images)
  useEffect(() => {
    if (!editor) return;
    const handleImageLoad = (e: Event) => {
      const target = e.target as HTMLElement;
      // Skip images inside pagination decorations to avoid infinite recalculation loop
      if (!(target instanceof HTMLImageElement)) return;
      if (target.closest(".page-break-decoration")) return;
      const { tr } = editor.state;
      tr.setMeta(paginationPluginKey, { __forceRecalc: true });
      tr.setMeta("addToHistory", false);
      editor.view.dispatch(tr);
    };
    const editorDom = editor.view.dom;
    editorDom.addEventListener("load", handleImageLoad, true); // capture phase for img loads
    return () => editorDom.removeEventListener("load", handleImageLoad, true);
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
    if (saveState !== "unsaved" || isReadOnly) return;
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

  const markPrintAncestors = useCallback(() => {
    const pageEl = pageRef.current;
    if (!pageEl) return;
    let el: HTMLElement | null = pageEl.parentElement;
    while (el && el !== document.body) {
      el.setAttribute("data-print-flow", "");
      el = el.parentElement;
    }
    document.body.setAttribute("data-printing", "");
  }, []);

  const cleanupPrintAncestors = useCallback(() => {
    document.body.removeAttribute("data-printing");
    document.querySelectorAll("[data-print-flow]").forEach((el) => {
      el.removeAttribute("data-print-flow");
    });
  }, []);

  const executePrint = useCallback((setup: () => (() => void)) => {
    markPrintAncestors();
    const teardown = setup();
    window.addEventListener("afterprint", () => { cleanupPrintAncestors(); teardown(); }, { once: true });
    window.print();
  }, [markPrintAncestors, cleanupPrintAncestors]);

  const handlePrint = useCallback(() => {
    executePrint(() => {
      // Build answer key for "With Answers" print
      const pageEl = pageRef.current;
      const answerNodes = pageEl?.querySelectorAll('.answer-section-wrapper') ?? [];
      let answerKeyContainer: HTMLDivElement | null = null;

      if (answerNodes.length > 0 && pageEl) {
        const entries: string[] = [];
        answerNodes.forEach((el, i) => {
          const customLabel = el.getAttribute("data-label");
          const ref = customLabel || String(i + 1);
          el.setAttribute("data-answer-ref", ref);
          const inner = el.querySelector(".answer-float-inner");
          const content = inner ? inner.innerHTML : "";
          entries.push(
            `<div class="print-answer-key-entry"><span class="print-answer-key-ref">${ref}.</span> ${content}</div>`
          );
        });

        answerKeyContainer = document.createElement("div");
        answerKeyContainer.className = "print-answer-key";
        answerKeyContainer.style.display = "none";
        answerKeyContainer.innerHTML = `<div class="print-answer-key-title">Answer Key</div><hr style="border:none;border-top:2px solid #333;margin:0 0 12px 0">${entries.join("")}`;
        pageEl.appendChild(answerKeyContainer);
      }

      return () => {
        answerKeyContainer?.remove();
        answerNodes.forEach((el) => el.removeAttribute("data-answer-ref"));
      };
    });
  }, [executePrint]);

  const handlePrintStudent = useCallback(() => {
    executePrint(() => {
      document.body.classList.add("student-print");
      return () => document.body.classList.remove("student-print");
    });
  }, [executePrint]);

  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const printMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPrintMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (printMenuRef.current && !printMenuRef.current.contains(e.target as Node)) {
        setShowPrintMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPrintMenu]);

  // Reactive toolbar state — updates on every selection & content change
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      const tsFont = e.getAttributes("textStyle").fontFamily;
      const tsSize = e.getAttributes("textStyle").fontSize;
      const defaultSize = docMetadata?.bodyFontSize?.toString() || "12";
      return {
        currentFontFamily: FONT_FAMILIES.find(ff => ff.value === tsFont)?.label
          || (docMetadata?.bodyFontFamily
              ? FONT_FAMILIES.find(ff => ff.value === docMetadata.bodyFontFamily)?.label || "Custom"
              : "Default"),
        currentFontSize: tsSize
          ? parseInt(tsSize, 10).toString()
          : defaultSize,
        currentHeading: e.isActive("heading", { level: 1 }) ? "Heading 1"
          : e.isActive("heading", { level: 2 }) ? "Heading 2"
          : e.isActive("heading", { level: 3 }) ? "Heading 3"
          : "Normal",
        currentAlignCenter: e.isActive({ textAlign: "center" }),
        currentAlignRight: e.isActive({ textAlign: "right" }),
      };
    },
  });
  const currentFontFamily = toolbarState?.currentFontFamily ?? "Default";
  const currentFontSize = toolbarState?.currentFontSize ?? "12";
  const currentHeading = toolbarState?.currentHeading ?? "Normal";
  const CurrentAlignIcon = toolbarState?.currentAlignCenter ? AlignCenter
    : toolbarState?.currentAlignRight ? AlignRight
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
    <div className="flex flex-col h-full bg-background print:bg-white">
      {/* Dynamic @page margins */}
      <style>{`@media print {
  @page { size: A4; margin: ${printMargins.top}mm ${printMargins.right}mm ${printMargins.bottom}mm ${printMargins.left}mm; }
}`}</style>
      {/* Top bar */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] print:hidden">
        <button
          onClick={() => router.push("/documents")}
          className="p-1.5 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors"
          title="Back to documents"
        >
          <ArrowLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </button>

        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setSaveState("unsaved"); }}
          onBlur={handleTitleBlur}
          readOnly={isReadOnly}
          className="flex-1 min-w-0 text-base sm:text-lg font-semibold bg-transparent text-gray-900 dark:text-white outline-none border-none"
          placeholder="Untitled Document"
        />

        {/* Save indicator / lock status */}
        {isReadOnly ? (
          <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <Lock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Read-only</span>
          </span>
        ) : (
          <button
            onClick={() => { if (saveState === "unsaved") saveNow(); }}
            className={cn(
              "flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400",
              saveState === "unsaved" && "hover:text-[#a0704b] cursor-pointer"
            )}
            disabled={saveState === "saving"}
            title={saveState === "unsaved" ? "Save now (Ctrl+S)" : undefined}
          >
            {saveState === "saving" && <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="hidden sm:inline"> Saving...</span></>}
            {saveState === "saved" && <><Check className="w-3.5 h-3.5 text-green-600" /><span className="hidden sm:inline"> Saved</span></>}
            {saveState === "unsaved" && <><CloudOff className="w-3.5 h-3.5" /><span className="hidden sm:inline"> Unsaved</span></>}
            {saveState === "error" && <><CloudOff className="w-3.5 h-3.5 text-red-500" /><span className="hidden sm:inline"> Error saving</span></>}
          </button>
        )}

        <button
          onClick={() => !isReadOnly && setPageLayoutOpen(true)}
          disabled={isReadOnly}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-[#e8d4b8] dark:border-[#6b5a4a] transition-colors",
            isReadOnly ? "opacity-50 cursor-not-allowed text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
          )}
          title="Page layout settings"
        >
          <FileSliders className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Layout</span>
        </button>

        <div className="relative" ref={printMenuRef}>
          <div className="flex items-center">
            <button
              onClick={() => { setShowPrintMenu(false); handlePrintStudent(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
              title="Print (questions only — no answers)"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              onClick={() => setShowPrintMenu(s => !s)}
              className="flex items-center self-stretch px-1.5 rounded-r-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover border-l border-primary-foreground/20 transition-colors"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
          {showPrintMenu && (
            <div className="absolute top-full right-0 mt-1 z-20 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg p-1 min-w-[10rem]">
              <button
                onClick={() => { setShowPrintMenu(false); handlePrintStudent(); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-gray-700 dark:text-gray-300"
              >
                Questions Only
              </button>
              <button
                onClick={() => { setShowPrintMenu(false); handlePrint(); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-gray-700 dark:text-gray-300"
              >
                With Answers
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

          {/* Spacer + actions */}
          <div className="flex-1" />
          <button
            onClick={() => { setShowFindReplace(s => !s); if (!showFindReplace) setTimeout(() => findInputRef.current?.focus(), 50); }}
            className={cn(
              "p-1.5 rounded transition-colors",
              showFindReplace ? "bg-[#a0704b] text-white" : "text-gray-400 dark:text-gray-500 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
            )}
            title="Find & Replace (Ctrl+F)"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowShortcutsModal(true)}
            className="p-1.5 rounded transition-colors text-gray-400 dark:text-gray-500 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
            title="Keyboard shortcuts (Ctrl+/)"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>
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
              {/* Heading dropdown */}
              <div className="relative">
                <button
                  onClick={() => toggleMenu("heading")}
                  className={cn(
                    "flex items-center gap-1 h-7 px-2 rounded text-xs transition-colors border",
                    activeMenu === "heading"
                      ? "bg-[#a0704b] text-white border-[#a0704b]"
                      : "text-gray-700 dark:text-gray-300 border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
                  )}
                  title="Heading Level"
                >
                  <span className="min-w-[4.5rem]">{currentHeading}</span>
                  <ChevronDown className="w-3 h-3 shrink-0" />
                </button>
                {activeMenu === "heading" && (
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
                          setActiveMenu(null);
                        }}
                        className={cn(
                          "w-full text-left px-2 py-1.5 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-gray-700 dark:text-gray-300",
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

              {/* Font Family dropdown */}
              <div className="relative">
                <button
                  onClick={() => toggleMenu("fontFamily")}
                  className={cn(
                    "flex items-center gap-1 h-7 px-2 rounded text-xs transition-colors border",
                    activeMenu === "fontFamily"
                      ? "bg-[#a0704b] text-white border-[#a0704b]"
                      : "text-gray-700 dark:text-gray-300 border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
                  )}
                  title="Font Family"
                >
                  <span className="truncate max-w-[7rem]">{currentFontFamily}</span>
                  <ChevronDown className="w-3 h-3 shrink-0" />
                </button>
                {activeMenu === "fontFamily" && (
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
                          setActiveMenu(null);
                        }}
                        className={cn(
                          "w-full text-left px-2 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-gray-700 dark:text-gray-300",
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
                  onClick={() => toggleMenu("fontSize")}
                  className={cn(
                    "flex items-center gap-1 h-7 px-2 rounded text-xs transition-colors border",
                    activeMenu === "fontSize"
                      ? "bg-[#a0704b] text-white border-[#a0704b]"
                      : "text-gray-700 dark:text-gray-300 border-[#e8d4b8] dark:border-[#6b5a4a] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
                  )}
                  title="Font Size"
                >
                  <span className="w-5 text-center">{currentFontSize}</span>
                  <ChevronDown className="w-3 h-3 shrink-0" />
                </button>
                {activeMenu === "fontSize" && (
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
                            setActiveMenu(null);
                          }}
                          className={cn(
                            "px-2 py-1 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-gray-700 dark:text-gray-300 text-center",
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
                          setActiveMenu(null);
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
                          className="w-14 px-1.5 py-0.5 text-xs border border-[#e8d4b8] dark:border-[#6b5a4a] rounded bg-transparent text-gray-700 dark:text-gray-300 outline-none focus:border-[#a0704b]"
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
                  onClick={() => toggleMenu("color")}
                  className={cn(
                    "rounded transition-colors",
                    showLabels ? "flex flex-col items-center gap-0.5 px-2 py-1" : "p-1.5",
                    activeMenu === "color" ? "bg-[#a0704b] text-white" : "text-gray-600 dark:text-gray-400 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
                  )}
                  title="Color"
                >
                  <Palette className="w-4 h-4" />
                  {showLabels && <span className="text-[9px] leading-none">Color</span>}
                </button>
                {activeMenu === "color" && (
                  <ColorGrid
                    colors={EDITOR_COLORS}
                    onSelect={(c) => editor.chain().focus().setColor(c).run()}
                    onRemove={() => editor.chain().focus().unsetColor().run()}
                    customValue={editor.getAttributes("textStyle").color || "#000000"}
                    onCustom={(c) => editor.chain().focus().setColor(c).run()}
                    removeTitle="Remove color"
                    customTitle="Custom color"
                  />
                )}
              </div>

              {/* Highlight */}
              <div className="relative">
                <button
                  onClick={() => toggleMenu("highlight")}
                  className={cn(
                    "rounded transition-colors",
                    showLabels ? "flex flex-col items-center gap-0.5 px-2 py-1" : "p-1.5",
                    activeMenu === "highlight" || editor.isActive("highlight") ? "bg-[#a0704b] text-white" : "text-gray-600 dark:text-gray-400 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
                  )}
                  title="Highlight"
                >
                  <Highlighter className="w-4 h-4" />
                  {showLabels && <span className="text-[9px] leading-none">Highlight</span>}
                </button>
                {activeMenu === "highlight" && (
                  <ColorGrid
                    colors={HIGHLIGHT_COLORS}
                    onSelect={(c) => editor.chain().focus().toggleHighlight({ color: c }).run()}
                    onRemove={() => editor.chain().focus().unsetHighlight().run()}
                    customValue="#fef08a"
                    onCustom={(c) => editor.chain().focus().toggleHighlight({ color: c }).run()}
                    removeTitle="Remove highlight"
                    customTitle="Custom highlight color"
                  />
                )}
              </div>
              <ToolbarSep />

              {/* Alignment dropdown */}
              <div className="relative">
                <button
                  onClick={() => toggleMenu("align")}
                  className={cn(
                    "rounded transition-colors",
                    showLabels ? "flex flex-col items-center gap-0.5 px-2 py-1" : "flex items-center gap-0.5 p-1.5",
                    activeMenu === "align" ? "bg-[#a0704b] text-white" : "text-gray-600 dark:text-gray-400 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
                  )}
                  title="Align"
                >
                  <div className="flex items-center gap-0.5">
                    <CurrentAlignIcon className="w-4 h-4" />
                    <ChevronDown className="w-3 h-3" />
                  </div>
                  {showLabels && <span className="text-[9px] leading-none">Align</span>}
                </button>
                {activeMenu === "align" && (
                  <div className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg p-1 min-w-[8rem]">
                    {ALIGN_OPTIONS.map((item) => (
                      <button
                        key={item.value}
                        onClick={() => { editor.chain().focus().setTextAlign(item.value).run(); setActiveMenu(null); }}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-gray-700 dark:text-gray-300",
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
              <ToolbarSep />
              <ToolbarBtn
                icon={KeyRound}
                label="Answer"
                isActive={editor.isActive("answerSection")}
                onClick={() => editor.chain().focus().insertAnswerSection().run()}
                showLabel={showLabels}
              />

              {/* Table menu */}
              <div className="relative">
                <button
                  onClick={() => toggleMenu("table")}
                  className={cn(
                    "rounded transition-colors",
                    showLabels ? "flex flex-col items-center gap-0.5 px-2 py-1" : "p-1.5",
                    activeMenu === "table" || editor.isActive("table")
                      ? "bg-[#a0704b] text-white"
                      : "text-gray-600 dark:text-gray-400 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
                  )}
                  title="Table"
                >
                  <Grid3X3 className="w-4 h-4" />
                  {showLabels && <span className="text-[9px] leading-none">Table</span>}
                </button>
                {activeMenu === "table" && (
                  <div className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg p-2" style={{ width: "12rem" }}>
                    {editor.isActive("table") ? (
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => { editor.chain().focus().addRowBefore().run(); setActiveMenu(null); }} className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-gray-700 dark:text-gray-300">
                          <Plus className="w-3 h-3" /> Add row above
                        </button>
                        <button onClick={() => { editor.chain().focus().addRowAfter().run(); setActiveMenu(null); }} className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-gray-700 dark:text-gray-300">
                          <Plus className="w-3 h-3" /> Add row below
                        </button>
                        <button onClick={() => { editor.chain().focus().addColumnBefore().run(); setActiveMenu(null); }} className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-gray-700 dark:text-gray-300">
                          <Plus className="w-3 h-3" /> Add column left
                        </button>
                        <button onClick={() => { editor.chain().focus().addColumnAfter().run(); setActiveMenu(null); }} className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-gray-700 dark:text-gray-300">
                          <Plus className="w-3 h-3" /> Add column right
                        </button>
                        <div className="h-px bg-[#e8d4b8] dark:bg-[#6b5a4a] my-1" />
                        <button onClick={() => { editor.chain().focus().deleteRow().run(); setActiveMenu(null); }} className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-gray-700 dark:text-gray-300">
                          <Minus className="w-3 h-3" /> Delete row
                        </button>
                        <button onClick={() => { editor.chain().focus().deleteColumn().run(); setActiveMenu(null); }} className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-gray-700 dark:text-gray-300">
                          <Minus className="w-3 h-3" /> Delete column
                        </button>
                        <button onClick={() => { editor.chain().focus().toggleHeaderRow().run(); setActiveMenu(null); }} className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] text-gray-700 dark:text-gray-300">
                          <ToggleLeft className="w-3 h-3" /> Toggle header row
                        </button>
                        <div className="h-px bg-[#e8d4b8] dark:bg-[#6b5a4a] my-1" />
                        <button onClick={() => { editor.chain().focus().deleteTable().run(); setActiveMenu(null); }} className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600">
                          <Trash2 className="w-3 h-3" /> Delete table
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1.5 px-0.5">
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
                                  setActiveMenu(null);
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

      {/* Find & Replace bar */}
      {showFindReplace && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] print:hidden">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <input
              ref={findInputRef}
              type="text"
              placeholder="Find..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); editor.commands.setSearchTerm(e.target.value); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? editor.commands.goToPreviousResult() : editor.commands.goToNextResult(); }
                if (e.key === "Escape") { setShowFindReplace(false); setSearchTerm(""); editor.commands.clearSearch(); }
              }}
              className="w-32 sm:w-48 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#a0704b]/40"
            />
            <span className="text-[10px] text-gray-400 tabular-nums flex-shrink-0">
              {editor.storage.searchAndReplace.results > 0
                ? `${editor.storage.searchAndReplace.resultIndex + 1}/${editor.storage.searchAndReplace.results}`
                : searchTerm ? "0/0" : ""}
            </span>
            <button onClick={() => editor.commands.goToPreviousResult()} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500" title="Previous (Shift+Enter)">
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => editor.commands.goToNextResult()} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500" title="Next (Enter)">
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={() => setShowReplace(s => !s)}
            className={cn("p-1 rounded transition-colors", showReplace ? "text-[#a0704b]" : "text-gray-400 hover:text-gray-600")}
            title="Toggle replace"
          >
            <Replace className="w-3.5 h-3.5" />
          </button>
          {showReplace && (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Replace..."
                value={replaceTerm}
                onChange={(e) => { setReplaceTerm(e.target.value); editor.commands.setReplaceTerm(e.target.value); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); editor.commands.replaceCurrent(); } }}
                className="w-28 sm:w-40 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#a0704b]/40"
              />
              <button onClick={() => editor.commands.replaceCurrent()} className="px-2 py-1 text-[10px] font-medium rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700" title="Replace current">
                Replace
              </button>
              <button onClick={() => editor.commands.replaceAll()} className="px-2 py-1 text-[10px] font-medium rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700" title="Replace all">
                All
              </button>
            </div>
          )}
          <button
            onClick={() => { setShowFindReplace(false); setSearchTerm(""); setReplaceTerm(""); editor.commands.clearSearch(); }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
            title="Close (Escape)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Lock banner */}
      {isReadOnly && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm print:hidden">
          <Lock className="w-4 h-4 shrink-0" />
          <span>This document is being edited by <strong>{lockedByOther}</strong>. You&apos;re viewing in read-only mode.</span>
          {isAdmin && (
            <button
              onClick={handleForceUnlock}
              className="ml-auto px-2 py-0.5 text-xs font-medium rounded bg-amber-200 dark:bg-amber-800 hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors"
            >
              Take over
            </button>
          )}
        </div>
      )}

      {/* Editor area — paginated A4 view */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-[#f0e8dc] dark:bg-[#0d0d0d] print:bg-white print:overflow-visible document-page-scroll-container">
        <div className="py-8 px-4 print:p-0 print:m-0">
          <div
            ref={pageRef}
            className={cn(
              "relative mx-auto bg-white shadow-lg print:shadow-none",
              "ring-1 ring-inset ring-gray-200 print:ring-0",
              paperMode ? "paper-mode" : "dark-paper bg-[#2a2420] ring-[#4a3a2a]",
              "document-page"
            )}
            style={{
              width: "210mm",
              minHeight: "297mm",
              padding: `${docMetadata?.margins?.top ?? 25.4}mm ${docMetadata?.margins?.right ?? 25.4}mm ${docMetadata?.margins?.bottom ?? 25.4}mm ${docMetadata?.margins?.left ?? 25.4}mm`,
              '--doc-ml': `${docMetadata?.margins?.left ?? 25.4}mm`,
              '--doc-mr': `${docMetadata?.margins?.right ?? 25.4}mm`,
              zoom: effectiveZoom !== 1 ? effectiveZoom : undefined,
              fontFamily: buildHFontFamily(docMetadata?.bodyFontFamily, docMetadata?.bodyFontFamilyCjk),
              fontSize: docMetadata?.bodyFontSize ? `${docMetadata.bodyFontSize}px` : undefined,
            } as React.CSSProperties}
          >
            {/* Watermark on first page */}
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

            {/* First-page header (React component) */}
            <div className="first-page-header">
              <PageHeader section={docMetadata?.header} docTitle={title} pageNumber={1} />
            </div>

            <EditorContent
              editor={editor}
              className={cn("document-editor-content prose prose-sm max-w-none", !paperMode && "prose-invert")}
            />

            {/* Floating formatting toolbar on text selection */}
            <EditorBubbleMenu editor={editor} />

            {/* Last-page footer (React component) — pagination decorations handle intermediate footers */}
            <div className="last-page-footer">
              <LastPageFooter
                section={docMetadata?.footer}
                docTitle={title}
                metadata={docMetadata}
                editor={editor}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Status bar: zoom controls + word count */}
      <div className="flex items-center justify-between px-4 py-1 border-t border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-xs text-gray-500 dark:text-gray-400 print:hidden">
        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            disabled={effectiveZoom <= 0.25}
            className="p-0.5 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] disabled:opacity-30 disabled:cursor-not-allowed"
            title="Zoom out (Ctrl+-)"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel("fit")}
            className={cn(
              "px-1.5 py-0.5 rounded min-w-[3rem] text-center tabular-nums",
              zoomLevel === "fit"
                ? "font-medium text-[#a0704b] dark:text-[#cd853f]"
                : "hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
            )}
            title="Fit to width (Ctrl+0)"
          >
            {Math.round(effectiveZoom * 100)}%
          </button>
          <button
            onClick={zoomIn}
            disabled={effectiveZoom >= 2}
            className="p-0.5 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] disabled:opacity-30 disabled:cursor-not-allowed"
            title="Zoom in (Ctrl+=)"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <div className="mx-1 h-3 border-l border-gray-300 dark:border-gray-600" />
          <button
            onClick={() => setPaperMode(!paperMode)}
            className={cn(
              "p-0.5 rounded",
              paperMode
                ? "text-amber-500 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
                : "hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
            )}
            title={paperMode ? "Paper mode: ON (document always light)" : "Paper mode: OFF (document follows theme)"}
          >
            {paperMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div>
          {editor.storage.characterCount.words()} words &middot; {editor.storage.characterCount.characters()} characters
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

      {/* Keyboard Shortcuts Modal */}
      {showShortcutsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden" onClick={() => setShowShortcutsModal(false)}>
          <div
            className="flex flex-col overflow-hidden bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-xl p-6"
            style={{ width: "28rem", maxWidth: "calc(100vw - 2rem)", maxHeight: "calc(100vh - 4rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Keyboard Shortcuts</h2>
              <button onClick={() => setShowShortcutsModal(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
              {([
                ["Text Formatting", [
                  ["Ctrl+B", "Bold"],
                  ["Ctrl+I", "Italic"],
                  ["Ctrl+U", "Underline"],
                  ["Ctrl+Shift+X", "Strikethrough"],
                  ["Ctrl+Shift+H", "Highlight"],
                ]],
                ["Structure", [
                  ["Ctrl+Shift+7", "Ordered list"],
                  ["Ctrl+Shift+8", "Bullet list"],
                  ["Ctrl+Shift+B", "Blockquote"],
                ]],
                ["Editing", [
                  ["Ctrl+Z", "Undo"],
                  ["Ctrl+Shift+Z", "Redo"],
                  ["Ctrl+S", "Save"],
                  ["Ctrl+F", "Find & Replace"],
                  ["Ctrl+A", "Select all"],
                ]],
                ["Page", [
                  ["Ctrl+Enter", "Page break"],
                ]],
                ["Zoom", [
                  ["Ctrl+=", "Zoom in"],
                  ["Ctrl+-", "Zoom out"],
                  ["Ctrl+0", "Fit to width"],
                ]],
                ["Navigation", [
                  ["Ctrl+/", "This shortcuts panel"],
                ]],
              ] as [string, [string, string][]][]).map(([category, shortcuts]) => (
                <div key={category}>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">{category}</h3>
                  <div className="space-y-1">
                    {shortcuts.map(([key, desc]) => (
                      <div key={key} className="flex items-center justify-between py-0.5">
                        <span className="text-xs text-gray-600 dark:text-gray-400">{desc}</span>
                        <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                          {key.replace(/Ctrl/g, navigator?.platform?.includes("Mac") ? "⌘" : "Ctrl")}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="flex-shrink-0 text-[10px] text-gray-400 mt-4 text-center">Press Escape or Ctrl+/ to close</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* Last-page footer — rendered as a React component below the editor content.
 * Includes a spacer to push the footer to the bottom of the last A4 page.
 * Subscribes to editor updates so the page number and spacer stay current. */
function LastPageFooter({
  section,
  docTitle,
  editor,
}: {
  section?: import("@/types").DocumentHeaderFooter;
  docTitle: string;
  metadata: DocumentMetadata | null;
  editor: ReturnType<typeof useEditor>;
}) {
  const [lastPageNumber, setLastPageNumber] = useState(1);
  const [spacerHeight, setSpacerHeight] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const pluginState = paginationPluginKey.getState(editor.state);
      const breakCount = pluginState?.breaks?.length ?? 0;
      setLastPageNumber(breakCount + 1);
      setSpacerHeight(pluginState?.lastPageRemainingPx ?? 0);
    };
    update();
    // Use "transaction" not "update" — TipTap's "update" only fires on doc changes,
    // but pagination dispatches a meta-only transaction (no doc change) with the
    // updated lastPageRemainingPx. "transaction" fires on all transactions.
    editor.on("transaction", update);
    return () => { editor.off("transaction", update); };
  }, [editor]);

  if (!editor) return null;

  return (
    <>
      {/* Spacer pushes footer to bottom of last A4 page */}
      <div className="last-page-footer-spacer" style={{ height: `${spacerHeight}px` }} />
      {section?.enabled && (
        <PageFooter section={section} docTitle={docTitle} pageNumber={lastPageNumber} />
      )}
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

/* Reusable color swatch grid for text color and highlight pickers */
function ColorGrid({ colors, onSelect, onRemove, customValue, onCustom, removeTitle, customTitle }: {
  colors: { color: string; label: string }[];
  onSelect: (color: string) => void;
  onRemove: () => void;
  customValue: string;
  onCustom: (color: string) => void;
  removeTitle: string;
  customTitle: string;
}) {
  return (
    <div className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg p-2 flex gap-1 items-center">
      {colors.map((c) => (
        <button
          key={c.color}
          onClick={() => onSelect(c.color)}
          className="w-6 h-6 rounded-full border border-[#e8d4b8] dark:border-[#6b5a4a] hover:scale-110 transition-transform"
          style={{ backgroundColor: c.color }}
          title={c.label}
        />
      ))}
      <button
        onClick={onRemove}
        className="w-6 h-6 rounded-full border border-[#e8d4b8] dark:border-[#6b5a4a] hover:scale-110 transition-transform flex items-center justify-center text-xs text-gray-500 dark:text-gray-400"
        title={removeTitle}
      >
        &times;
      </button>
      <input
        type="color"
        defaultValue={customValue}
        onInput={(e) => onCustom((e.target as HTMLInputElement).value)}
        onChange={(e) => onCustom(e.target.value)}
        className="doc-color-swatch w-6 h-6 rounded-full hover:scale-110 transition-transform"
        title={customTitle}
      />
    </div>
  );
}

/* Toolbar separator */
function ToolbarSep() {
  return <div className="w-px h-5 bg-[#e8d4b8] dark:bg-[#6b5a4a] mx-1 shrink-0" />;
}

/* Floating bubble menu — appears above text selections */
function EditorBubbleMenu({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!editor) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const update = () => {
      if (timer) clearTimeout(timer);
      setPos(null);
      timer = setTimeout(() => {
        const { from, to } = editor.state.selection;
        if (from === to || !editor.view.hasFocus() || editor.isActive("image") || editor.isActive("geometryDiagram")) {
          setPos(null);
          return;
        }
        const sel = window.getSelection();
        if (!sel?.rangeCount) { setPos(null); return; }
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (!rect.width && !rect.height) { setPos(null); return; }
        setPos({ top: rect.top, left: rect.left + rect.width / 2 });
      }, 300);
    };
    const hide = () => { if (timer) clearTimeout(timer); setPos(null); };
    editor.on("selectionUpdate", update);
    editor.on("blur", hide);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("blur", hide);
      if (timer) clearTimeout(timer);
    };
  }, [editor]);

  if (!editor || !pos) return null;

  return (
    <div
      onMouseDown={(e) => e.preventDefault()} // keep editor focus when clicking toolbar
      className="flex items-center gap-0.5 px-1.5 py-1 bg-[#1a1a1a] dark:bg-[#111] rounded-lg shadow-xl border border-white/10 print:hidden"
      style={{ position: "fixed", top: pos.top - 8, left: pos.left, transform: "translate(-50%, -100%)", zIndex: 200 }}
    >
      <BubbleBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold"><Bold className="w-3.5 h-3.5" /></BubbleBtn>
      <BubbleBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic"><Italic className="w-3.5 h-3.5" /></BubbleBtn>
      <BubbleBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline"><UnderlineIcon className="w-3.5 h-3.5" /></BubbleBtn>
      <BubbleBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough"><Strikethrough className="w-3.5 h-3.5" /></BubbleBtn>
      <BubbleSep />
      <BubbleBtn
        active={editor.isActive("link")}
        onClick={() => {
          if (editor.isActive("link")) { editor.chain().focus().unsetLink().run(); }
          else { const url = window.prompt("Enter URL:"); if (url) editor.chain().focus().setLink({ href: url }).run(); }
        }}
        title={editor.isActive("link") ? "Remove link" : "Add link"}
      >
        {editor.isActive("link") ? <Unlink className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
      </BubbleBtn>
      <BubbleSep />
      {EDITOR_COLORS.map((c) => (
        <button key={c.color} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().setColor(c.color).run()}
          className="w-3.5 h-3.5 rounded-full border border-white/25 hover:scale-110 transition-transform flex-shrink-0" style={{ backgroundColor: c.color }} title={c.label} />
      ))}
      <BubbleSep />
      {HIGHLIGHT_COLORS.slice(0, 4).map((c) => (
        <button key={c.color} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleHighlight({ color: c.color }).run()}
          className="w-3.5 h-3.5 rounded-full border border-white/25 hover:scale-110 transition-transform flex-shrink-0" style={{ backgroundColor: c.color }} title={`Highlight: ${c.label}`} />
      ))}
    </div>
  );
}

/* Bubble menu button (dark background) */
function BubbleBtn({ active, onClick, title, children }: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "p-1 rounded transition-colors",
        active ? "bg-white/20 text-white" : "text-white/70 hover:text-white hover:bg-white/10"
      )}
    >
      {children}
    </button>
  );
}

/* Bubble menu separator */
function BubbleSep() {
  return <div className="w-px h-4 bg-white/20 mx-0.5 shrink-0" />;
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
