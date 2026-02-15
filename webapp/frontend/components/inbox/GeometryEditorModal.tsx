"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  MousePointer2,
  Circle,
  Minus,
  Pentagon,
  Type,
  Undo2,
  Redo2,
  Trash2,
  TrendingUp,
  Dot,
  TriangleRight,
  PieChart,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import {
  serializeBoard,
  deserializeToBoard,
  exportBoardSvg,
  createThemedBoard,
  applyBoardTheme,
  LIGHT_BOARD_ATTRS,
  type GeometryState,
} from "@/lib/geometry-utils";
import {
  TOOL_HANDLERS,
  getMouseCoords,
  DEFAULT_POINT_ATTRS,
  DEFAULT_LINE_ATTRS,
  DEFAULT_FILL_ATTRS,
} from "@/lib/geometry-tools";
import { latexToJs } from "@/lib/latex-to-js";
import { KEYBOARD_THEME_CSS } from "@/lib/mathlive-theme";
import { patchMathLiveMenu } from "@/lib/mathlive-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tool =
  | "select"
  | "point"
  | "line"
  | "segment"
  | "circle"
  | "sector"
  | "polygon"
  | "function"
  | "text"
  | "angle";

interface GeometryEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (graphJson: string, svgDataUri: string) => void;
  initialState?: GeometryState | null;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS: { id: Tool; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: "select", label: "Select", icon: <MousePointer2 className="h-4 w-4" />, hint: "Click to select, Delete to remove" },
  { id: "point", label: "Point", icon: <Dot className="h-4 w-4" />, hint: "Click to place, or type coordinates" },
  { id: "line", label: "Line", icon: <Minus className="h-4 w-4 rotate-[30deg]" />, hint: "Click 2 points" },
  { id: "segment", label: "Segment", icon: <Minus className="h-4 w-4" />, hint: "Click 2 points" },
  { id: "circle", label: "Circle", icon: <Circle className="h-4 w-4" />, hint: "Center, then edge" },
  { id: "sector", label: "Sector", icon: <PieChart className="h-4 w-4" />, hint: "Click center, start, end" },
  { id: "polygon", label: "Polygon", icon: <Pentagon className="h-4 w-4" />, hint: "Click vertices, dbl-click to close" },
  { id: "function", label: "f(x)", icon: <TrendingUp className="h-4 w-4" />, hint: "Type a math expression and press Plot" },
  { id: "text", label: "Label", icon: <Type className="h-4 w-4" />, hint: "Click to place text" },
  { id: "angle", label: "Angle", icon: <TriangleRight className="h-4 w-4" />, hint: "Click endpoint, vertex, endpoint" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GeometryEditorModal({
  isOpen,
  onClose,
  onInsert,
  initialState,
}: GeometryEditorModalProps) {
  const { resolvedTheme } = useTheme();
  const { showToast } = useToast();

  const [tool, setTool] = useState<Tool>("point");
  const [jsxLoaded, setJsxLoaded] = useState(false);
  const [mathFieldLoaded, setMathFieldLoaded] = useState(false);
  const [funcInput, setFuncInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [coordInput, setCoordInput] = useState("");
  const [objectCount, setObjectCount] = useState(0);
  const [boardVersion, setBoardVersion] = useState(0);
  const [selectedEl, setSelectedEl] = useState<any>(null);
  const [editCoords, setEditCoords] = useState("");

  const boardRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingPointsRef = useRef<any[]>([]);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const [redoCount, setRedoCount] = useState(0);
  const JXGRef = useRef<any>(null);
  const lastClickTimeRef = useRef(0);
  const funcFieldRef = useRef<HTMLElement | null>(null);
  const themeInitRef = useRef(false);

  const isEditing = !!initialState;

  // ---------------------------------------------------------------------------
  // Lazy-load JSXGraph
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen || jsxLoaded) return;
    Promise.all([
      import("jsxgraph"),
      // Also inject JSXGraph CSS once
      new Promise<void>((resolve) => {
        if (document.getElementById("jsxgraph-css")) { resolve(); return; }
        const link = document.createElement("link");
        link.id = "jsxgraph-css";
        link.rel = "stylesheet";
        link.href = ""; // We'll inline it instead
        // Inline the minimum needed CSS overrides
        const style = document.createElement("style");
        style.id = "jsxgraph-css";
        style.textContent = `
          .jxgbox { border: none !important; border-radius: 0 !important; background: transparent !important; }
          .jxgbox svg text { font-family: inherit; }
        `;
        document.head.appendChild(style);
        resolve();
      }),
    ]).then(([mod]) => {
      JXGRef.current = (mod as any).default || mod;
      setJsxLoaded(true);
    });
    // Lazy-load mathlive in parallel (for function tool math input)
    if (!mathFieldLoaded) {
      import("mathlive").then(() => setMathFieldLoaded(true));
    }
  }, [isOpen, jsxLoaded, mathFieldLoaded]);

  // ---------------------------------------------------------------------------
  // isDark helper (reactive via next-themes)
  // ---------------------------------------------------------------------------

  const isDark = useCallback(() => {
    return resolvedTheme === "dark";
  }, [resolvedTheme]);

  // ---------------------------------------------------------------------------
  // Init board
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!jsxLoaded || !isOpen || !containerRef.current) return;
    const JXG = JXGRef.current;
    if (!JXG) return;

    // Clean up existing board
    if (boardRef.current) {
      JXG.JSXGraph.freeBoard(boardRef.current);
      boardRef.current = null;
    }

    const bb = initialState?.boundingBox || LIGHT_BOARD_ATTRS.boundingbox;
    const board = createThemedBoard(JXG, containerRef.current, bb, isDark());

    boardRef.current = board;
    pendingPointsRef.current = [];
    undoStackRef.current = [];
    redoStackRef.current = [];
    setRedoCount(0);

    // Restore state if editing
    if (initialState?.objects?.length > 0) {
      deserializeToBoard(board, initialState, false);
      updateObjectCount();
    }

    return () => {
      if (boardRef.current) {
        JXG.JSXGraph.freeBoard(boardRef.current);
        boardRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsxLoaded, isOpen]);

  // ---------------------------------------------------------------------------
  // Re-theme board when app theme changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const board = boardRef.current;
    if (!board || !containerRef.current) return;

    // Skip the initial render (board init already set the right theme)
    if (!themeInitRef.current) {
      themeInitRef.current = true;
      return;
    }

    applyBoardTheme(board, containerRef.current, resolvedTheme === "dark");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme]);

  // ---------------------------------------------------------------------------
  // Object count
  // ---------------------------------------------------------------------------

  const updateObjectCount = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const count = board.objectsList.filter(
      (el: any) =>
        el.elType &&
        !["axis", "ticks", "grid", "label"].includes(el.elType)
    ).length;
    setObjectCount(count);
  }, []);

  // ---------------------------------------------------------------------------
  // Snapshot for undo
  // ---------------------------------------------------------------------------

  const pushUndo = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const state = serializeBoard(board);
    undoStackRef.current.push(JSON.stringify(state));
    // Keep stack size reasonable
    if (undoStackRef.current.length > 50) {
      undoStackRef.current.shift();
    }
    // New action invalidates redo history
    redoStackRef.current = [];
    setRedoCount(0);
  }, []);

  // ---------------------------------------------------------------------------
  // Board click handler — creates objects based on active tool
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const board = boardRef.current;
    if (!board || !isOpen) return;

    const handleDown = (e: any) => {
      if (tool === "select") {
        // In select mode, detect which element was clicked
        const allUnder = Object.values(board.highlightedObjects || {}) as any[];
        const userEl = allUnder.find(
          (el: any) => el.elType && !["axis", "ticks", "grid", "label"].includes(el.elType)
        );
        if (userEl) {
          setSelectedEl(userEl);
          if (userEl.elType === "point") {
            setEditCoords(`${userEl.X().toFixed(2)}, ${userEl.Y().toFixed(2)}`);
          } else {
            setEditCoords("");
          }
        } else {
          setSelectedEl(null);
          setEditCoords("");
        }
        return;
      }
      if (tool === "function") return;

      // Get coordinates from the event
      const coords = getMouseCoords(board, e);
      if (!coords) return;
      const [x, y] = coords;

      const handler = TOOL_HANDLERS[tool];
      if (handler) {
        const result = handler(
          {
            board,
            pendingPoints: pendingPointsRef.current,
            pushUndo,
            updateObjectCount,
            isDark: isDark(),
            textInput,
            setTextInput,
            lastClickTime: lastClickTimeRef.current,
          },
          x,
          y
        );
        pendingPointsRef.current = result.pendingPoints;
        lastClickTimeRef.current = result.lastClickTime;
      }
    };

    board.on("down", handleDown);
    return () => {
      board.off("down", handleDown);
    };
  }, [tool, isOpen, jsxLoaded, textInput, boardVersion, pushUndo, updateObjectCount, isDark]);

  // Handle double-click to close polygon
  useEffect(() => {
    const board = boardRef.current;
    if (!board || !isOpen || tool !== "polygon") return;

    const handleDblClick = () => {
      const pending = pendingPointsRef.current;
      if (pending.length >= 3) {
        pushUndo();
        // Remove temporary dashed segments
        const toRemove = board.objectsList.filter(
          (el: any) => el.elType === "segment" && el.visProp?.dash === 2
        );
        for (const seg of toRemove) {
          board.removeObject(seg);
        }
        board.create("polygon", pending, DEFAULT_FILL_ATTRS);
        pendingPointsRef.current = [];
        updateObjectCount();
      }
    };

    const el = containerRef.current;
    if (el) el.addEventListener("dblclick", handleDblClick);
    return () => {
      if (el) el.removeEventListener("dblclick", handleDblClick);
    };
  }, [tool, isOpen, jsxLoaded, boardVersion, pushUndo, updateObjectCount]);

  // ---------------------------------------------------------------------------
  // Selection highlight
  // ---------------------------------------------------------------------------

  const prevSelectedRef = useRef<any>(null);

  useEffect(() => {
    const prev = prevSelectedRef.current;
    // Restore previous element's original style
    if (prev && prev._origStroke !== undefined) {
      try {
        prev.setAttribute({
          strokeColor: prev._origStroke,
          strokeWidth: prev._origWidth,
        });
        delete prev._origStroke;
        delete prev._origWidth;
      } catch { /* element may have been removed */ }
    }
    // Apply highlight to newly selected element
    if (selectedEl) {
      try {
        selectedEl._origStroke = selectedEl.visProp?.strokecolor || "#8b5f3c";
        selectedEl._origWidth = selectedEl.visProp?.strokewidth || 2;
        selectedEl.setAttribute({
          strokeColor: "#e67e22",
          strokeWidth: selectedEl.elType === "point" ? selectedEl._origWidth : 3,
        });
      } catch { /* ignore */ }
    }
    prevSelectedRef.current = selectedEl;
  }, [selectedEl]);

  // ---------------------------------------------------------------------------
  // Clear pending points and selection when tool changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setSelectedEl(null);
    setEditCoords("");
  }, [tool]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    // Remove orphan pending points (those with no dependents)
    const pending = pendingPointsRef.current;
    // If we have dangling pending points when switching tools, remove them
    // unless they're part of a completed construction
    if (pending.length > 0) {
      for (const p of pending) {
        // Only remove if point has no children
        if (p.childElements && Object.keys(p.childElements).length === 0) {
          board.removeObject(p);
        }
      }
      pendingPointsRef.current = [];
      // Also remove temporary dashed segments
      const dashed = board.objectsList.filter(
        (el: any) => el.elType === "segment" && el.visProp?.dash === 2
      );
      for (const seg of dashed) {
        board.removeObject(seg);
      }
      board.update();
    }
  }, [tool]);

  // ---------------------------------------------------------------------------
  // Configure MathLive mathfield when function tool is active
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (tool !== "function" || !mathFieldLoaded) return;

    let cancelled = false;
    let showTimer: ReturnType<typeof setTimeout>;

    // Wait for the math-field element to mount, then configure & show keyboard
    const initTimer = setTimeout(() => {
      if (cancelled) return;
      const mf = funcFieldRef.current as any;
      if (!mf) return;
      mf.mathVirtualKeyboardPolicy = "manual";
      mf.focus();

      // Show the virtual keyboard after MathLive's internal connection delay
      showTimer = setTimeout(() => {
        if (cancelled) return;
        const kbd = (window as any).mathVirtualKeyboard;
        if (kbd) kbd.show({ animate: true });
      }, 100);
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(initTimer);
      clearTimeout(showTimer);
      // Hide keyboard when switching away from function tool
      const kbd = (window as any).mathVirtualKeyboard;
      if (kbd) kbd.hide();
    };
  }, [tool, mathFieldLoaded]);

  // Hide virtual keyboard when modal closes
  useEffect(() => {
    if (!isOpen && mathFieldLoaded) {
      const kbd = (window as any).mathVirtualKeyboard;
      if (kbd) kbd.hide();
    }
  }, [isOpen, mathFieldLoaded]);

  // Patch MathLive menu to prevent scrim from dismissing on initial click
  useEffect(() => {
    if (!mathFieldLoaded || !isOpen || tool !== "function") return;
    return patchMathLiveMenu(funcFieldRef);
  }, [mathFieldLoaded, isOpen, tool]);

  // ---------------------------------------------------------------------------
  // Undo
  // ---------------------------------------------------------------------------

  const handleUndo = useCallback(() => {
    const board = boardRef.current;
    const JXG = JXGRef.current;
    if (!board || !JXG || undoStackRef.current.length === 0) return;

    // Save current state for redo
    const currentState = serializeBoard(board);
    redoStackRef.current.push(JSON.stringify(currentState));
    setRedoCount(redoStackRef.current.length);

    const prevStateJson = undoStackRef.current.pop()!;
    const prevState: GeometryState = JSON.parse(prevStateJson);

    // Clear board and recreate
    JXG.JSXGraph.freeBoard(board);
    const newBoard = createThemedBoard(JXG, containerRef.current!, prevState.boundingBox, isDark());
    boardRef.current = newBoard;
    deserializeToBoard(newBoard, prevState, false);
    pendingPointsRef.current = [];
    setSelectedEl(null);
    setEditCoords("");
    updateObjectCount();
    setBoardVersion((v) => v + 1);
  }, [isDark, updateObjectCount]);

  // ---------------------------------------------------------------------------
  // Redo
  // ---------------------------------------------------------------------------

  const handleRedo = useCallback(() => {
    const board = boardRef.current;
    const JXG = JXGRef.current;
    if (!board || !JXG || redoStackRef.current.length === 0) return;

    // Save current state for undo (without clearing redo)
    const currentState = serializeBoard(board);
    undoStackRef.current.push(JSON.stringify(currentState));

    const nextStateJson = redoStackRef.current.pop()!;
    const nextState: GeometryState = JSON.parse(nextStateJson);
    setRedoCount(redoStackRef.current.length);

    JXG.JSXGraph.freeBoard(board);
    const newBoard = createThemedBoard(JXG, containerRef.current!, nextState.boundingBox, isDark());
    boardRef.current = newBoard;
    deserializeToBoard(newBoard, nextState, false);
    pendingPointsRef.current = [];
    setSelectedEl(null);
    setEditCoords("");
    updateObjectCount();
    setBoardVersion((v) => v + 1);
  }, [isDark, updateObjectCount]);

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------

  const handleClear = useCallback(() => {
    const board = boardRef.current;
    const JXG = JXGRef.current;
    if (!board || !JXG) return;

    pushUndo();
    JXG.JSXGraph.freeBoard(board);
    const newBoard = createThemedBoard(JXG, containerRef.current!, LIGHT_BOARD_ATTRS.boundingbox, isDark());
    boardRef.current = newBoard;
    pendingPointsRef.current = [];
    setSelectedEl(null);
    setEditCoords("");
    updateObjectCount();
    setBoardVersion((v) => v + 1);
  }, [isDark, pushUndo, updateObjectCount]);

  // ---------------------------------------------------------------------------
  // Add function graph
  // ---------------------------------------------------------------------------

  const handleAddFunction = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;

    // Read from MathLive mathfield if available, otherwise fall back to text input
    const mf = funcFieldRef.current as any;
    const latex = mf?.value || "";
    const rawInput = latex || funcInput.trim();
    if (!rawInput) return;

    try {
      // Convert LaTeX to JS if it came from MathLive, otherwise use as-is
      const jsExpr = latex ? latexToJs(latex) : rawInput;
      // eslint-disable-next-line no-new-func
      const fn = new Function("x", `return (${jsExpr})`);
      // Quick sanity check
      const testVal = fn(0);
      if (typeof testVal !== "number" || isNaN(testVal)) {
        // Allow NaN for things like 1/0, but not undefined
        if (testVal === undefined) {
          showToast("Expression returned undefined — check your syntax", "error");
          return;
        }
      }
      pushUndo();
      const curve = board.create("functiongraph", [fn], {
        ...DEFAULT_LINE_ATTRS,
        strokeWidth: 2.5,
        name: "",
      });
      (curve as any)._expression = jsExpr;
      (curve as any)._latex = latex || "";
      setFuncInput("");
      // Clear the mathfield
      if (mf) mf.value = "";
      updateObjectCount();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      showToast(`Invalid expression: ${msg}`, "error");
    }
  }, [funcInput, pushUndo, updateObjectCount, showToast]);

  // ---------------------------------------------------------------------------
  // Add point at exact coordinates
  // ---------------------------------------------------------------------------

  const handleAddPoint = useCallback(() => {
    const board = boardRef.current;
    if (!board || !coordInput.trim()) return;
    const parts = coordInput.split(",").map((s) => parseFloat(s.trim()));
    if (parts.length !== 2 || parts.some(isNaN)) return;
    pushUndo();
    board.create("point", [parts[0], parts[1]], { ...DEFAULT_POINT_ATTRS, name: "" });
    setCoordInput("");
    updateObjectCount();
  }, [coordInput, pushUndo, updateObjectCount]);

  // ---------------------------------------------------------------------------
  // Move selected point to new coordinates
  // ---------------------------------------------------------------------------

  const handleApplyCoordEdit = useCallback(() => {
    if (!selectedEl || selectedEl.elType !== "point" || !editCoords.trim()) return;
    const parts = editCoords.split(",").map((s) => parseFloat(s.trim()));
    if (parts.length !== 2 || parts.some(isNaN)) return;
    pushUndo();
    selectedEl.moveTo([parts[0], parts[1]]);
    boardRef.current?.update();
    setEditCoords(`${parts[0].toFixed(2)}, ${parts[1].toFixed(2)}`);
  }, [selectedEl, editCoords, pushUndo]);

  // ---------------------------------------------------------------------------
  // Delete selected element
  // ---------------------------------------------------------------------------

  const handleDeleteSelected = useCallback(() => {
    const board = boardRef.current;
    if (!board || !selectedEl) return;
    pushUndo();
    board.removeObject(selectedEl);
    setSelectedEl(null);
    setEditCoords("");
    updateObjectCount();
  }, [selectedEl, pushUndo, updateObjectCount]);

  // ---------------------------------------------------------------------------
  // Zoom controls
  // ---------------------------------------------------------------------------

  const handleZoomReset = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const bb = initialState?.boundingBox || [-8, 6, 8, -6];
    board.setBoundingBox(bb, true);
    board.fullUpdate();
  }, [initialState]);

  // ---------------------------------------------------------------------------
  // Insert
  // ---------------------------------------------------------------------------

  const handleInsert = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;

    const state = serializeBoard(board);
    const svgDataUri = exportBoardSvg(board);
    onInsert(JSON.stringify(state), svgDataUri);
    onClose();
  }, [onInsert, onClose]);

  // ---------------------------------------------------------------------------
  // Delete (for editing mode)
  // ---------------------------------------------------------------------------

  const handleDelete = useCallback(() => {
    onInsert("", "");
    onClose();
  }, [onInsert, onClose]);

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedEl) {
          setSelectedEl(null);
          setEditCoords("");
          e.stopPropagation();
        } else {
          e.stopPropagation();
          onClose();
        }
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedEl) {
        // Don't delete if focus is in an input field
        if ((e.target as HTMLElement)?.tagName === "INPUT") return;
        e.preventDefault();
        handleDeleteSelected();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleInsert();
      } else if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
    },
    [onClose, handleInsert, handleUndo, handleRedo, selectedEl, handleDeleteSelected]
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[5vh]"
      onKeyDown={handleKeyDown}
    >
      {/* MathLive keyboard theme */}
      <style>{KEYBOARD_THEME_CSS}</style>

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full mx-4 bg-white dark:bg-[#2a2a2a] rounded-xl shadow-2xl border border-[#e8d4b8] dark:border-[#6b5a4a] animate-in fade-in zoom-in-95 duration-150 flex flex-col"
        style={{ maxWidth: "52rem", maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {isEditing ? "Edit Diagram" : "Create Diagram"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 flex-wrap">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={`${t.label} — ${t.hint}`}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors",
                tool === t.id
                  ? "bg-[#a0704b] text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
              )}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}

          <div className="w-px h-5 bg-[#e8d4b8]/60 dark:bg-[#6b5a4a]/60 mx-1" />

          <button
            onClick={handleUndo}
            disabled={undoStackRef.current.length === 0}
            title="Undo (Ctrl+Z)"
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] rounded-lg transition-colors disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoCount === 0}
            title="Redo (Ctrl+Shift+Z)"
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] rounded-lg transition-colors disabled:opacity-30"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            onClick={handleClear}
            title="Clear all"
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 rounded-lg transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* Function input bar — shown when function tool is active */}
        {tool === "function" && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 bg-[#faf6f1]/50 dark:bg-[#1e1a15]/50">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">
              f(x) =
            </span>
            {mathFieldLoaded ? (
              <math-field
                ref={funcFieldRef as any}
                aria-label="Function expression"
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAddFunction();
                  }
                }}
                style={{
                  flex: 1,
                  display: "block",
                  fontSize: "14px",
                  padding: "4px 8px",
                  minHeight: "32px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color)",
                  background: "transparent",
                  outline: "none",
                  "--hue": "27",
                  "--border-color": isDark() ? "#6b5a4a" : "#e8d4b8",
                } as React.CSSProperties}
              />
            ) : (
              <input
                type="text"
                value={funcInput}
                onChange={(e) => setFuncInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAddFunction();
                  }
                }}
                placeholder="Loading math input..."
                className="flex-1 px-2 py-1 text-xs font-mono bg-white dark:bg-[#2a2518] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-md outline-none focus:ring-1 focus:ring-[#a0704b] text-gray-800 dark:text-gray-200"
              />
            )}
            <button
              onClick={handleAddFunction}
              className="px-3 py-1 text-xs font-medium bg-[#a0704b] text-white rounded-md hover:bg-[#8b5f3c] disabled:opacity-40 transition-colors"
            >
              Plot
            </button>
          </div>
        )}

        {/* Text input bar — shown when text tool is active */}
        {tool === "text" && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 bg-[#faf6f1]/50 dark:bg-[#1e1a15]/50">
            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
              Label:
            </span>
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type text, then click on the board to place it"
              className="flex-1 px-2 py-1 text-xs bg-white dark:bg-[#2a2518] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-md outline-none focus:ring-1 focus:ring-[#a0704b] text-gray-800 dark:text-gray-200"
            />
          </div>
        )}

        {/* Coordinate input bar — shown when point tool is active */}
        {tool === "point" && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 bg-[#faf6f1]/50 dark:bg-[#1e1a15]/50">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">
              (x, y)
            </span>
            <input
              type="text"
              value={coordInput}
              onChange={(e) => setCoordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleAddPoint();
                }
              }}
              placeholder="3, -2"
              className="flex-1 px-2 py-1 text-xs font-mono bg-white dark:bg-[#2a2518] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-md outline-none focus:ring-1 focus:ring-[#a0704b] text-gray-800 dark:text-gray-200"
            />
            <button
              onClick={handleAddPoint}
              disabled={!coordInput.trim()}
              className="px-3 py-1 text-xs font-medium bg-[#a0704b] text-white rounded-md hover:bg-[#8b5f3c] disabled:opacity-40 transition-colors"
            >
              Place
            </button>
          </div>
        )}

        {/* Selected point coordinate editor — shown when a point is selected in select mode */}
        {tool === "select" && selectedEl?.elType === "point" && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 bg-[#faf6f1]/50 dark:bg-[#1e1a15]/50">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">
              Move to
            </span>
            <input
              type="text"
              value={editCoords}
              onChange={(e) => setEditCoords(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleApplyCoordEdit();
                }
              }}
              placeholder="x, y"
              className="flex-1 px-2 py-1 text-xs font-mono bg-white dark:bg-[#2a2518] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-md outline-none focus:ring-1 focus:ring-[#a0704b] text-gray-800 dark:text-gray-200"
            />
            <button
              onClick={handleApplyCoordEdit}
              disabled={!editCoords.trim()}
              className="px-3 py-1 text-xs font-medium bg-[#a0704b] text-white rounded-md hover:bg-[#8b5f3c] disabled:opacity-40 transition-colors"
            >
              Move
            </button>
            <button
              onClick={handleDeleteSelected}
              className="px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
            >
              Delete
            </button>
          </div>
        )}

        {/* Selected non-point element info bar */}
        {tool === "select" && selectedEl && selectedEl.elType !== "point" && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 bg-[#faf6f1]/50 dark:bg-[#1e1a15]/50">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Selected: <span className="font-medium text-gray-700 dark:text-gray-300">{selectedEl.elType}</span>
            </span>
            <div className="flex-1" />
            <button
              onClick={handleDeleteSelected}
              className="px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
            >
              Delete
            </button>
          </div>
        )}

        {/* Tool hint */}
        <div className="px-4 py-1 text-[10px] text-gray-400 dark:text-gray-500">
          {TOOLS.find((t) => t.id === tool)?.hint}
          {pendingPointsRef.current.length > 0 && (
            <span className="ml-2 text-[#a0704b]">
              {pendingPointsRef.current.length} point(s) selected
            </span>
          )}
        </div>

        {/* Board container */}
        <div className="flex-1 min-h-0 px-3 pb-2">
          {jsxLoaded ? (
            <div
              ref={containerRef}
              className="w-full rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden"
              style={{ height: "400px", cursor: tool === "select" ? "default" : tool === "function" ? "default" : "crosshair" }}
            />
          ) : (
            <div className="flex items-center justify-center h-[400px] text-sm text-gray-400">
              Loading geometry editor...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {objectCount} object{objectCount !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => boardRef.current?.zoomIn()}
                title="Zoom in"
                className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => boardRef.current?.zoomOut()}
                title="Zoom out"
                className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleZoomReset}
                title="Reset view"
                className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isEditing && (
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                Delete
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleInsert}
              disabled={objectCount === 0}
              className="px-4 py-1.5 text-xs font-medium bg-[#a0704b] hover:bg-[#8b5f3c] text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isEditing ? "Update" : "Insert"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
