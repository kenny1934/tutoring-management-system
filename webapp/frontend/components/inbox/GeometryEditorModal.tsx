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
  Trash2,
  TrendingUp,
  Dot,
  TriangleRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  serializeBoard,
  deserializeToBoard,
  exportBoardSvg,
  type GeometryState,
} from "@/lib/geometry-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tool =
  | "select"
  | "point"
  | "line"
  | "segment"
  | "circle"
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
  { id: "select", label: "Select", icon: <MousePointer2 className="h-4 w-4" />, hint: "Move objects" },
  { id: "point", label: "Point", icon: <Dot className="h-4 w-4" />, hint: "Click to place" },
  { id: "line", label: "Line", icon: <Minus className="h-4 w-4 rotate-[30deg]" />, hint: "Click 2 points" },
  { id: "segment", label: "Segment", icon: <Minus className="h-4 w-4" />, hint: "Click 2 points" },
  { id: "circle", label: "Circle", icon: <Circle className="h-4 w-4" />, hint: "Center, then edge" },
  { id: "polygon", label: "Polygon", icon: <Pentagon className="h-4 w-4" />, hint: "Click vertices, dbl-click to close" },
  { id: "function", label: "f(x)", icon: <TrendingUp className="h-4 w-4" />, hint: "Plot a function" },
  { id: "text", label: "Label", icon: <Type className="h-4 w-4" />, hint: "Click to place text" },
  { id: "angle", label: "Angle", icon: <TriangleRight className="h-4 w-4" />, hint: "Click 3 points" },
];

// ---------------------------------------------------------------------------
// Board theme (warm brown palette)
// ---------------------------------------------------------------------------

const LIGHT_BOARD_ATTRS = {
  boundingbox: [-8, 6, 8, -6],
  axis: true,
  showCopyright: false,
  showNavigation: false,
  pan: { enabled: true, needTwoFingers: false },
  zoom: { factorX: 1.25, factorY: 1.25, wheel: true, needShift: false },
  defaultAxes: {
    x: { strokeColor: "#6b5a4a", highlightStrokeColor: "#6b5a4a",
         ticks: { strokeColor: "#d4c0a8", minorTicks: 0 } },
    y: { strokeColor: "#6b5a4a", highlightStrokeColor: "#6b5a4a",
         ticks: { strokeColor: "#d4c0a8", minorTicks: 0 } },
  },
  grid: { strokeColor: "#e8d4b8", strokeOpacity: 0.6 },
  renderer: "svg",
};

const DARK_BOARD_ATTRS = {
  ...LIGHT_BOARD_ATTRS,
  defaultAxes: {
    x: { strokeColor: "#a0907a", highlightStrokeColor: "#a0907a",
         ticks: { strokeColor: "#4a3d30", minorTicks: 0 } },
    y: { strokeColor: "#a0907a", highlightStrokeColor: "#a0907a",
         ticks: { strokeColor: "#4a3d30", minorTicks: 0 } },
  },
  grid: { strokeColor: "#3d3628", strokeOpacity: 0.6 },
};

const DEFAULT_POINT_ATTRS = {
  strokeColor: "#a0704b",
  fillColor: "#a0704b",
  highlightStrokeColor: "#8b5f3c",
  highlightFillColor: "#8b5f3c",
  size: 3,
};

const DEFAULT_LINE_ATTRS = {
  strokeColor: "#8b5f3c",
  highlightStrokeColor: "#a0704b",
  strokeWidth: 2,
};

const DEFAULT_FILL_ATTRS = {
  ...DEFAULT_LINE_ATTRS,
  fillColor: "rgba(160,112,75,0.15)",
  highlightFillColor: "rgba(160,112,75,0.25)",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GeometryEditorModal({
  isOpen,
  onClose,
  onInsert,
  initialState,
}: GeometryEditorModalProps) {
  const [tool, setTool] = useState<Tool>("point");
  const [jsxLoaded, setJsxLoaded] = useState(false);
  const [funcInput, setFuncInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [objectCount, setObjectCount] = useState(0);
  const [boardVersion, setBoardVersion] = useState(0);

  const boardRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingPointsRef = useRef<any[]>([]);
  const undoStackRef = useRef<string[]>([]);
  const JXGRef = useRef<any>(null);
  const lastClickTimeRef = useRef(0);

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
  }, [isOpen, jsxLoaded]);

  // ---------------------------------------------------------------------------
  // isDark helper (use matchMedia rather than next-themes to keep it simple)
  // ---------------------------------------------------------------------------

  const isDark = useCallback(() => {
    return (
      document.documentElement.classList.contains("dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  }, []);

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

    const dark = isDark();
    const attrs = dark ? DARK_BOARD_ATTRS : LIGHT_BOARD_ATTRS;
    const boardAttrs = initialState
      ? { ...attrs, boundingbox: initialState.boundingBox }
      : attrs;

    const board = JXG.JSXGraph.initBoard(containerRef.current, {
      ...boardAttrs,
      document: document,
      keepAspectRatio: false,
    });

    boardRef.current = board;
    pendingPointsRef.current = [];
    undoStackRef.current = [];

    // Set board background for dark mode
    if (dark && containerRef.current) {
      containerRef.current.style.backgroundColor = "#2a2a2a";
    } else if (containerRef.current) {
      containerRef.current.style.backgroundColor = "#ffffff";
    }

    // Restore state if editing
    if (initialState && initialState.objects.length > 0) {
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
  }, []);

  // ---------------------------------------------------------------------------
  // Board click handler — creates objects based on active tool
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const board = boardRef.current;
    if (!board || !isOpen) return;

    const handleDown = (e: any) => {
      if (tool === "select" || tool === "function") return;

      // Get coordinates from the event
      const coords = getMouseCoords(board, e);
      if (!coords) return;
      const [x, y] = coords;

      switch (tool) {
        case "point":
          pushUndo();
          board.create("point", [x, y], { ...DEFAULT_POINT_ATTRS, name: "" });
          updateObjectCount();
          break;

        case "line":
        case "segment": {
          const pending = pendingPointsRef.current;
          if (pending.length === 0) {
            const p = board.create("point", [x, y], {
              ...DEFAULT_POINT_ATTRS,
              name: "",
            });
            pending.push(p);
          } else {
            pushUndo();
            const p2 = board.create("point", [x, y], {
              ...DEFAULT_POINT_ATTRS,
              name: "",
            });
            const lineType = tool === "line" ? "line" : "segment";
            board.create(lineType, [pending[0], p2], {
              ...DEFAULT_LINE_ATTRS,
              straightFirst: tool === "line",
              straightLast: tool === "line",
            });
            pendingPointsRef.current = [];
            updateObjectCount();
          }
          break;
        }

        case "circle": {
          const pending = pendingPointsRef.current;
          if (pending.length === 0) {
            const center = board.create("point", [x, y], {
              ...DEFAULT_POINT_ATTRS,
              name: "",
            });
            pending.push(center);
          } else {
            pushUndo();
            const edgePoint = board.create("point", [x, y], {
              ...DEFAULT_POINT_ATTRS,
              name: "",
            });
            board.create("circle", [pending[0], edgePoint], DEFAULT_LINE_ATTRS);
            pendingPointsRef.current = [];
            updateObjectCount();
          }
          break;
        }

        case "polygon": {
          // Debounce: skip if this is the second click of a double-click
          const now = Date.now();
          if (now - lastClickTimeRef.current < 300) break;
          lastClickTimeRef.current = now;

          const pending = pendingPointsRef.current;
          const p = board.create("point", [x, y], {
            ...DEFAULT_POINT_ATTRS,
            name: "",
          });
          pending.push(p);
          // Visual feedback: draw temporary segments between vertices
          if (pending.length > 1) {
            board.create("segment", [pending[pending.length - 2], p], {
              ...DEFAULT_LINE_ATTRS,
              dash: 2,
              name: "",
            });
          }
          board.update();
          break;
        }

        case "text": {
          if (!textInput.trim()) return;
          pushUndo();
          board.create("text", [x, y, textInput.trim()], {
            fontSize: 14,
            strokeColor: isDark() ? "#e3d5c5" : "#1f2937",
            fixed: false,
          });
          setTextInput("");
          updateObjectCount();
          break;
        }

        case "angle": {
          const pending = pendingPointsRef.current;
          const ap = board.create("point", [x, y], {
            ...DEFAULT_POINT_ATTRS,
            name: "",
          });
          pending.push(ap);
          if (pending.length === 3) {
            pushUndo();
            board.create("angle", [pending[0], pending[1], pending[2]], {
              radius: 1,
              fillColor: "rgba(160,112,75,0.2)",
              strokeColor: "#a0704b",
              name: "",
            });
            pendingPointsRef.current = [];
            updateObjectCount();
          }
          break;
        }
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
  // Toggle pan based on active tool
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    try {
      board.setAttribute({
        pan: { enabled: tool === "select", needTwoFingers: false },
      });
    } catch {
      // Board may not support setAttribute for pan
    }
  }, [tool, boardVersion]);

  // ---------------------------------------------------------------------------
  // Clear pending points when tool changes
  // ---------------------------------------------------------------------------

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
  // Get mouse coordinates from board event
  // ---------------------------------------------------------------------------

  function getMouseCoords(board: any, e: any): [number, number] | null {
    try {
      const coords = board.getUsrCoordsOfMouse(e);
      return [coords[0], coords[1]];
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Undo
  // ---------------------------------------------------------------------------

  const handleUndo = useCallback(() => {
    const board = boardRef.current;
    const JXG = JXGRef.current;
    if (!board || !JXG || undoStackRef.current.length === 0) return;

    const prevStateJson = undoStackRef.current.pop()!;
    const prevState: GeometryState = JSON.parse(prevStateJson);

    // Clear board and recreate
    JXG.JSXGraph.freeBoard(board);
    const dark = isDark();
    const attrs = dark ? DARK_BOARD_ATTRS : LIGHT_BOARD_ATTRS;
    const newBoard = JXG.JSXGraph.initBoard(containerRef.current!, {
      ...attrs,
      boundingbox: prevState.boundingBox,
      document: document,
      keepAspectRatio: false,
    });

    if (dark && containerRef.current) {
      containerRef.current.style.backgroundColor = "#2a2a2a";
    }

    boardRef.current = newBoard;
    deserializeToBoard(newBoard, prevState, false);
    pendingPointsRef.current = [];
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
    const dark = isDark();
    const attrs = dark ? DARK_BOARD_ATTRS : LIGHT_BOARD_ATTRS;
    const newBoard = JXG.JSXGraph.initBoard(containerRef.current!, {
      ...attrs,
      document: document,
      keepAspectRatio: false,
    });

    if (dark && containerRef.current) {
      containerRef.current.style.backgroundColor = "#2a2a2a";
    }

    boardRef.current = newBoard;
    pendingPointsRef.current = [];
    updateObjectCount();
    setBoardVersion((v) => v + 1);
  }, [isDark, pushUndo, updateObjectCount]);

  // ---------------------------------------------------------------------------
  // Add function graph
  // ---------------------------------------------------------------------------

  const handleAddFunction = useCallback(() => {
    const board = boardRef.current;
    if (!board || !funcInput.trim()) return;

    pushUndo();
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function("x", `return (${funcInput.trim()})`);
      // Quick sanity check
      fn(0);
      const curve = board.create("functiongraph", [fn], {
        ...DEFAULT_LINE_ATTRS,
        strokeWidth: 2.5,
        name: "",
      });
      (curve as any)._expression = funcInput.trim();
      setFuncInput("");
      updateObjectCount();
    } catch {
      // Invalid expression — do nothing
    }
  }, [funcInput, pushUndo, updateObjectCount]);

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
        e.stopPropagation();
        onClose();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleInsert();
      } else if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
    },
    [onClose, handleInsert, handleUndo]
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
            title="Undo (Ctrl+Z)"
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] rounded-lg transition-colors"
          >
            <Undo2 className="h-4 w-4" />
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
              placeholder="Math.sin(x), x**2 + 1, ..."
              className="flex-1 px-2 py-1 text-xs font-mono bg-white dark:bg-[#2a2518] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-md outline-none focus:ring-1 focus:ring-[#a0704b] text-gray-800 dark:text-gray-200"
            />
            <button
              onClick={handleAddFunction}
              disabled={!funcInput.trim()}
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
              style={{ height: "400px", cursor: tool === "select" ? "grab" : tool === "function" ? "default" : "crosshair" }}
            />
          ) : (
            <div className="flex items-center justify-center h-[400px] text-sm text-gray-400">
              Loading geometry editor...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {objectCount} object{objectCount !== 1 ? "s" : ""} ·
            scroll to zoom · drag to pan
          </span>

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
