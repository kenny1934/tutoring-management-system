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
  Grid3x3,
  Shapes,
  Download,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import {
  serializeBoard,
  deserializeToBoard,
  exportBoardSvg,
  exportBoardPng,
  downloadBlob,
  createThemedBoard,
  applyBoardTheme,
  LIGHT_BOARD_ATTRS,
  type GeometryState,
} from "@/lib/geometry-utils";
import {
  TOOL_HANDLERS,
  getMouseCoords,
  generatePointName,
  getPointAttrs,
  getLineAttrs,
  getFillAttrs,
  createShapePreset,
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
  | "angle"
  | "perpendicular"
  | "parallel"
  | "midpoint"
  | "bisector";

type CurveMode = "fx" | "implicit" | "parametric";

interface GeometryEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (graphJson: string, svgDataUri: string) => void;
  initialState?: GeometryState | null;
  /** True when editing an existing diagram in the document (shows Update/Delete). False for new diagrams, even if pre-filled. */
  isEditingExisting?: boolean;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const COLOR_PALETTE = [
  { color: "#a0704b", label: "Brown" },
  { color: "#dc2626", label: "Red" },
  { color: "#2563eb", label: "Blue" },
  { color: "#16a34a", label: "Green" },
  { color: "#9333ea", label: "Purple" },
  { color: "#ea580c", label: "Orange" },
  { color: "#1f2937", label: "Black" },
  { color: "#6b7280", label: "Gray" },
];

const TOOLS: { id: Tool; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: "select", label: "Select", icon: <MousePointer2 className="h-4 w-4" />, hint: "Click to select \u00B7 Drag to area-select \u00B7 Middle/right-drag to pan \u00B7 Delete to remove" },
  { id: "point", label: "Point", icon: <Dot className="h-4 w-4" />, hint: "Click to place, or type coordinates" },
  { id: "line", label: "Line", icon: <Minus className="h-4 w-4 rotate-[30deg]" />, hint: "Click 2 points" },
  { id: "segment", label: "Segment", icon: <Minus className="h-4 w-4" />, hint: "Click 2 points" },
  { id: "circle", label: "Circle", icon: <Circle className="h-4 w-4" />, hint: "Center, then edge" },
  { id: "sector", label: "Sector", icon: <PieChart className="h-4 w-4" />, hint: "Click center, start, end" },
  { id: "polygon", label: "Polygon", icon: <Pentagon className="h-4 w-4" />, hint: "Click vertices, dbl-click to close" },
  { id: "function", label: "f(x)", icon: <TrendingUp className="h-4 w-4" />, hint: "Plot f(x), implicit f(x,y)=0, or parametric x(t),y(t) curves" },
  { id: "text", label: "Label", icon: <Type className="h-4 w-4" />, hint: "Click to place text" },
  { id: "angle", label: "Angle", icon: <TriangleRight className="h-4 w-4" />, hint: "Click endpoint, vertex, endpoint" },
  { id: "perpendicular", label: "Perp.", icon: <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="3" y1="13" x2="13" y2="13" /><line x1="8" y1="3" x2="8" y2="13" /><rect x="8" y="10" width="3" height="3" strokeWidth="1" /></svg>, hint: "Click point, then a line" },
  { id: "parallel", label: "Para.", icon: <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="5" x2="14" y2="5" /><line x1="2" y1="11" x2="14" y2="11" /></svg>, hint: "Click point, then a line" },
  { id: "midpoint", label: "Mid", icon: <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="8" x2="14" y2="8" /><circle cx="8" cy="8" r="2.5" fill="currentColor" /></svg>, hint: "Click two points" },
  { id: "bisector", label: "Bisect", icon: <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="8" y1="13" x2="3" y2="3" /><line x1="8" y1="13" x2="13" y2="3" /><line x1="8" y1="13" x2="8" y2="2" strokeDasharray="2 1.5" /></svg>, hint: "Click 3 points: ray, vertex, ray" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GeometryEditorModal({
  isOpen,
  onClose,
  onInsert,
  initialState,
  isEditingExisting = false,
}: GeometryEditorModalProps) {
  const { resolvedTheme } = useTheme();
  const { showToast } = useToast();

  const [tool, setTool] = useState<Tool>("point");
  const [jsxLoaded, setJsxLoaded] = useState(false);
  const [mathFieldLoaded, setMathFieldLoaded] = useState(false);
  const [funcInput, setFuncInput] = useState("");
  const [curveMode, setCurveMode] = useState<CurveMode>("fx");
  const [tMinInput, setTMinInput] = useState("0");
  const [tMaxInput, setTMaxInput] = useState("2π");
  const [textInput, setTextInput] = useState("");
  const [coordInput, setCoordInput] = useState("");
  const [objectCount, setObjectCount] = useState(0);
  const [boardVersion, setBoardVersion] = useState(0);
  const [selectedEl, setSelectedEl] = useState<any>(null);
  const [editCoords, setEditCoords] = useState("");
  const [editName, setEditName] = useState("");
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [activeColor, setActiveColor] = useState("#a0704b");
  const [activeDash, setActiveDash] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [shapePreset, setShapePreset] = useState<string | null>(null);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const shapeMenuRef = useRef<HTMLDivElement>(null);

  const boardRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingPointsRef = useRef<any[]>([]);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const [redoCount, setRedoCount] = useState(0);
  const JXGRef = useRef<any>(null);
  const lastClickTimeRef = useRef(0);
  const funcFieldRef = useRef<HTMLElement | null>(null);
  const xtFieldRef = useRef<HTMLElement | null>(null);
  const ytFieldRef = useRef<HTMLElement | null>(null);
  const themeInitRef = useRef(false);
  const pointCounterRef = useRef(0);

  // Area selection state
  const selectStartRef = useRef<[number, number] | null>(null);
  const isSelectDraggingRef = useRef(false);
  const [selectionRect, setSelectionRect] = useState<{
    x1: number; y1: number; x2: number; y2: number;
  } | null>(null);

  // Custom pan state (middle/right-click drag + two-finger touch)
  const isPanningRef = useRef(false);
  const panLastRef = useRef<{ x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const touchPanRef = useRef<{ x: number; y: number } | null>(null);

  const isEditing = isEditingExisting;

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

  /** Count existing named points on the board and reset the counter. */
  const recalcPointCounter = useCallback(() => {
    const board = boardRef.current;
    if (!board) { pointCounterRef.current = 0; return; }
    let max = 0;
    for (const el of board.objectsList) {
      if (el.elType === "point" && el.name) max++;
    }
    pointCounterRef.current = max;
  }, []);

  const nextPointName = useCallback(() => {
    const name = generatePointName(pointCounterRef.current);
    pointCounterRef.current++;
    return name;
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

    const bb = initialState?.boundingBox || LIGHT_BOARD_ATTRS.boundingbox;
    const board = createThemedBoard(JXG, containerRef.current, bb, isDark());

    boardRef.current = board;
    pendingPointsRef.current = [];
    undoStackRef.current = [];
    redoStackRef.current = [];
    setRedoCount(0);

    // Restore state if editing
    if (initialState?.objects?.length > 0) {
      deserializeToBoard(board, initialState, false, isDark());
      updateObjectCount();
    }
    recalcPointCounter();

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

  // Update all existing points when snap-to-grid is toggled
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    for (const el of board.objectsList) {
      if (el.elType === "point") {
        el.setAttribute({ snapToGrid });
      }
    }
    board.fullUpdate();
  }, [snapToGrid]);

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
  // Area selection helpers
  // ---------------------------------------------------------------------------

  /** Get the defining points of a compound element. */
  const getElementPoints = useCallback((board: any, el: any): any[] => {
    if (!el) return [];
    if (el.elType === "angle" && el.parents?.length >= 3) {
      return el.parents.map((id: string) => board.objects[id]).filter(Boolean);
    }
    if (el.elType === "polygon" && el.vertices) {
      return el.vertices.filter((v: any) => v.elType === "point");
    }
    if (el.elType === "circle" && el.center) {
      return [el.center, el.point2].filter(Boolean);
    }
    if (["segment", "line"].includes(el.elType) && el.point1 && el.point2) {
      return [el.point1, el.point2];
    }
    return [];
  }, []);

  /** Find the highest-priority compound element whose defining points are all within a rectangle. */
  const findBestElementInRect = useCallback((board: any, x1: number, y1: number, x2: number, y2: number) => {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    const inside = (p: any) => p.X() >= minX && p.X() <= maxX && p.Y() >= minY && p.Y() <= maxY;

    // Priority: angle (4) > polygon (3) > circle (2) > segment/line (1)
    let best: any = null, bestPriority = -1;
    for (const el of board.objectsList) {
      if (["axis", "ticks", "grid", "label"].includes(el.elType)) continue;
      if (el.visProp?.visible === false) continue;

      let pts: any[] = [];
      let priority = 0;

      if (el.elType === "angle" && el.parents?.length >= 3) {
        pts = el.parents.map((id: string) => board.objects[id]).filter(Boolean);
        priority = 4;
      } else if (el.elType === "polygon" && el.vertices) {
        pts = el.vertices.filter((v: any) => v.elType === "point");
        priority = 3;
      } else if (el.elType === "circle" && el.center && el.point2) {
        pts = [el.center, el.point2];
        priority = 2;
      } else if (["segment", "line"].includes(el.elType) && el.point1 && el.point2) {
        pts = [el.point1, el.point2];
        priority = 1;
      }

      if (pts.length >= 2 && pts.every(inside) && priority > bestPriority) {
        best = el;
        bestPriority = priority;
      }
    }
    return best;
  }, []);

  /** Restore group-selected points to normal (draggable) and clear group state. */
  /** Disband the active JSXGraph Group so points move independently again. */
  const clearGroupSelection = useCallback((board: any) => {
    if (board._activeGroup) {
      try { board._activeGroup.ungroup(); } catch { /* group may have been removed */ }
      board._activeGroup = null;
    }
  }, []);

  /** Select a compound element — create a JSXGraph Group for synchronized movement. */
  const selectCompoundElement = useCallback((board: any, el: any) => {
    clearGroupSelection(board);
    setSelectedEl(el);
    setEditCoords("");
    setEditName("");
    const pts = getElementPoints(board, el);
    if (pts.length >= 2) {
      board._activeGroup = board.create("group", pts);
    }
  }, [getElementPoints, clearGroupSelection]);

  // ---------------------------------------------------------------------------
  // Board click handler — creates objects based on active tool
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const board = boardRef.current;
    if (!board || !isOpen) return;

    const handleDown = (e: any) => {
      if (tool === "select") {
        const coords = getMouseCoords(board, e);
        if (!coords) return;

        // Check if an element is under cursor
        const allUnder = Object.values(board.highlightedObjects || {}) as any[];
        const userEl = allUnder.find(
          (el: any) => el.elType && !["axis", "ticks", "grid", "label"].includes(el.elType)
        );

        if (userEl) {
          // If clicking a point that belongs to the active group, push undo
          // for the upcoming group drag — don't deselect the group
          if (board._activeGroup && userEl.elType === "point") {
            const groupEls = board._activeGroup.objects;
            const inGroup = groupEls && Object.keys(groupEls).includes(userEl.id);
            if (inGroup) {
              pushUndo();
              selectStartRef.current = null;
              isSelectDraggingRef.current = false;
              return;
            }
          }
          // Click-to-select individual element (clears any active group)
          clearGroupSelection(board);
          setSelectedEl(userEl);
          if (userEl.elType === "point") {
            setEditCoords(`${userEl.X().toFixed(2)}, ${userEl.Y().toFixed(2)}`);
            setEditName(userEl.name || "");
          } else {
            setEditCoords("");
            setEditName("");
          }
          selectStartRef.current = null;
        } else {
          // Empty space — start potential area selection
          selectStartRef.current = coords;
        }
        isSelectDraggingRef.current = false;
        return;
      }
      if (tool === "function") return;

      // Get coordinates from the event
      const coords = getMouseCoords(board, e);
      if (!coords) return;
      const [x, y] = coords;

      // Shape preset: click to place
      if (shapePreset) {
        pushUndo();
        createShapePreset(board, shapePreset, x, y, activeColor, activeDash, isDark(), nextPointName);
        setShapePreset(null);
        updateObjectCount();
        recalcPointCounter();
        return;
      }

      const handler = TOOL_HANDLERS[tool];
      if (handler) {
        const result = handler(
          {
            board,
            pendingPoints: pendingPointsRef.current,
            pushUndo,
            updateObjectCount,
            isDark: isDark(),
            snapToGrid,
            nextPointName,
            textInput,
            setTextInput,
            lastClickTime: lastClickTimeRef.current,
            activeColor,
            activeDash,
          },
          x,
          y
        );
        pendingPointsRef.current = result.pendingPoints;
        lastClickTimeRef.current = result.lastClickTime;
        setPendingCount(result.pendingPoints.length);
      }
    };

    const handleMove = (e: any) => {
      if (tool !== "select" || !selectStartRef.current) return;
      const coords = getMouseCoords(board, e);
      if (!coords) return;
      const [sx, sy] = selectStartRef.current;
      const [cx, cy] = coords;
      const dist = Math.sqrt((cx - sx) ** 2 + (cy - sy) ** 2);
      if (dist < 0.2) return;
      isSelectDraggingRef.current = true;
      setSelectionRect({ x1: sx, y1: sy, x2: cx, y2: cy });
    };

    const handleUp = (e: any) => {
      if (tool !== "select") return;

      if (isSelectDraggingRef.current && selectStartRef.current) {
        // Area selection — find compound element within rect
        const coords = getMouseCoords(board, e);
        if (coords) {
          const [sx, sy] = selectStartRef.current;
          const [ex, ey] = coords;
          const found = findBestElementInRect(board, sx, sy, ex, ey);
          if (found) {
            selectCompoundElement(board, found);
          } else {
            clearGroupSelection(board);
            setSelectedEl(null);
            setEditCoords("");
            setEditName("");
          }
        }
      } else if (selectStartRef.current) {
        // Clicked on empty space without dragging — deselect
        clearGroupSelection(board);
        setSelectedEl(null);
        setEditCoords("");
        setEditName("");
      }

      selectStartRef.current = null;
      isSelectDraggingRef.current = false;
      setSelectionRect(null);
    };

    board.on("down", handleDown);
    board.on("move", handleMove);
    board.on("up", handleUp);
    return () => {
      board.off("down", handleDown);
      board.off("move", handleMove);
      board.off("up", handleUp);
    };
  }, [tool, isOpen, jsxLoaded, textInput, boardVersion, pushUndo, updateObjectCount, isDark, snapToGrid, nextPointName, activeColor, activeDash, shapePreset, recalcPointCounter, findBestElementInRect, selectCompoundElement, clearGroupSelection]);

  // Close polygon — shared by double-click and explicit button
  const handleClosePolygon = useCallback(() => {
    const board = boardRef.current;
    const pending = pendingPointsRef.current;
    if (!board || pending.length < 3) return;

    pushUndo();
    // Remove temporary dashed segments
    const toRemove = board.objectsList.filter(
      (el: any) => el.elType === "segment" && el.visProp?.dash === 2
    );
    for (const seg of toRemove) {
      board.removeObject(seg);
    }
    board.create("polygon", pending, { ...getFillAttrs(activeColor, activeDash), hasInnerPoints: true });
    pendingPointsRef.current = [];
    setPendingCount(0);
    updateObjectCount();
  }, [pushUndo, updateObjectCount, activeColor, activeDash]);

  // Handle double-click to close polygon
  useEffect(() => {
    const board = boardRef.current;
    if (!board || !isOpen || tool !== "polygon") return;

    const el = containerRef.current;
    if (el) el.addEventListener("dblclick", handleClosePolygon);
    return () => {
      if (el) el.removeEventListener("dblclick", handleClosePolygon);
    };
  }, [tool, isOpen, jsxLoaded, boardVersion, handleClosePolygon]);

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
    const board = boardRef.current;
    if (board) {
      clearGroupSelection(board);
      // Disable native pan in all modes — we handle pan via middle/right-click drag
      board.setAttribute({ pan: { enabled: false } });
    }
    setSelectedEl(null);
    setEditCoords("");
    setEditName("");
    setPendingCount(0);
  }, [tool, clearGroupSelection]);

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
  // Custom pan: middle/right-click drag (all modes) + two-finger touch
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 1 || e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        isPanningRef.current = true;
        panLastRef.current = { x: e.clientX, y: e.clientY };
        setIsPanning(true);
        el.setPointerCapture(e.pointerId);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isPanningRef.current || !panLastRef.current) return;
      const board = boardRef.current;
      if (!board) return;
      e.preventDefault();
      const dx = (e.clientX - panLastRef.current.x) / board.unitX;
      const dy = (e.clientY - panLastRef.current.y) / board.unitY;
      const bb = board.getBoundingBox();
      board.setBoundingBox([bb[0] - dx, bb[1] + dy, bb[2] - dx, bb[3] + dy], false);
      panLastRef.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        panLastRef.current = null;
        setIsPanning(false);
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    // Two-finger touch pan
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        touchPanRef.current = {
          x: (t0.clientX + t1.clientX) / 2,
          y: (t0.clientY + t1.clientY) / 2,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2 && touchPanRef.current) {
        e.preventDefault();
        const board = boardRef.current;
        if (!board) return;
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const midX = (t0.clientX + t1.clientX) / 2;
        const midY = (t0.clientY + t1.clientY) / 2;
        const dx = (midX - touchPanRef.current.x) / board.unitX;
        const dy = (midY - touchPanRef.current.y) / board.unitY;
        const bb = board.getBoundingBox();
        board.setBoundingBox([bb[0] - dx, bb[1] + dy, bb[2] - dx, bb[3] + dy], false);
        touchPanRef.current = { x: midX, y: midY };
      }
    };

    const onTouchEnd = () => {
      touchPanRef.current = null;
    };

    el.addEventListener("pointerdown", onPointerDown, { capture: true });
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("contextmenu", onContextMenu);
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown, true);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("contextmenu", onContextMenu);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [jsxLoaded]);

  // Close shapes menu on click outside
  useEffect(() => {
    if (!shapeMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (shapeMenuRef.current && !shapeMenuRef.current.contains(e.target as Node)) {
        setShapeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [shapeMenuOpen]);

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

      // Configure all math fields (parametric mode has xt/yt fields)
      const fields = curveMode === "parametric"
        ? [xtFieldRef.current, ytFieldRef.current]
        : [funcFieldRef.current];
      for (const mf of fields) {
        if (mf) (mf as any).mathVirtualKeyboardPolicy = "manual";
      }

      // Focus the primary field
      const primary = (curveMode === "parametric" ? xtFieldRef.current : funcFieldRef.current) as any;
      if (primary) primary.focus();

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
  }, [tool, mathFieldLoaded, curveMode]);

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
    if (curveMode === "parametric") {
      const cleanupXt = patchMathLiveMenu(xtFieldRef);
      const cleanupYt = patchMathLiveMenu(ytFieldRef);
      return () => { cleanupXt?.(); cleanupYt?.(); };
    }
    return patchMathLiveMenu(funcFieldRef);
  }, [mathFieldLoaded, isOpen, tool, curveMode]);

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
    clearGroupSelection(board);
    JXG.JSXGraph.freeBoard(board);
    const newBoard = createThemedBoard(JXG, containerRef.current!, prevState.boundingBox, isDark());
    boardRef.current = newBoard;
    deserializeToBoard(newBoard, prevState, false, isDark());
    pendingPointsRef.current = [];
    setSelectedEl(null);
    setEditCoords("");
    setEditName("");
    updateObjectCount();
    recalcPointCounter();
    setBoardVersion((v) => v + 1);
  }, [isDark, updateObjectCount, recalcPointCounter, clearGroupSelection]);

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

    clearGroupSelection(board);
    JXG.JSXGraph.freeBoard(board);
    const newBoard = createThemedBoard(JXG, containerRef.current!, nextState.boundingBox, isDark());
    boardRef.current = newBoard;
    deserializeToBoard(newBoard, nextState, false, isDark());
    pendingPointsRef.current = [];
    setSelectedEl(null);
    setEditCoords("");
    setEditName("");
    updateObjectCount();
    recalcPointCounter();
    setBoardVersion((v) => v + 1);
  }, [isDark, updateObjectCount, recalcPointCounter, clearGroupSelection]);

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------

  const handleClear = useCallback(() => {
    const board = boardRef.current;
    const JXG = JXGRef.current;
    if (!board || !JXG) return;

    pushUndo();
    clearGroupSelection(board);
    JXG.JSXGraph.freeBoard(board);
    const newBoard = createThemedBoard(JXG, containerRef.current!, LIGHT_BOARD_ATTRS.boundingbox, isDark());
    boardRef.current = newBoard;
    pendingPointsRef.current = [];
    setSelectedEl(null);
    setEditCoords("");
    setEditName("");
    updateObjectCount();
    pointCounterRef.current = 0;
    setBoardVersion((v) => v + 1);
  }, [isDark, pushUndo, updateObjectCount, clearGroupSelection]);

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
        ...getLineAttrs(activeColor, activeDash),
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
  }, [funcInput, pushUndo, updateObjectCount, showToast, activeColor, activeDash]);

  // ---------------------------------------------------------------------------
  // Add implicit curve f(x,y) = 0
  // ---------------------------------------------------------------------------

  const handleAddImplicitCurve = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;

    const mf = funcFieldRef.current as any;
    const latex = mf?.value || "";
    const rawInput = latex || funcInput.trim();
    if (!rawInput) return;

    try {
      let jsExpr = latex ? latexToJs(latex) : rawInput;
      // If user typed "LHS = RHS", rearrange to "(LHS) - (RHS)"
      const eqIdx = jsExpr.indexOf("=");
      if (eqIdx !== -1 && jsExpr[eqIdx - 1] !== "!" && jsExpr[eqIdx + 1] !== "=") {
        const lhs = jsExpr.slice(0, eqIdx);
        const rhs = jsExpr.slice(eqIdx + 1);
        jsExpr = `(${lhs}) - (${rhs})`;
      }
      // eslint-disable-next-line no-new-func
      const fn = new Function("x", "y", `return (${jsExpr})`);
      fn(0, 0); // sanity check

      pushUndo();
      const curve = board.create("implicitcurve", [fn], {
        ...getLineAttrs(activeColor, activeDash),
        strokeWidth: 2.5,
        resolution_outer: 30,
        resolution_inner: 30,
        name: "",
      });
      (curve as any)._expression = jsExpr;
      (curve as any)._latex = latex || "";
      (curve as any)._curveMode = "implicit";
      setFuncInput("");
      if (mf) mf.value = "";
      updateObjectCount();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      showToast(`Invalid expression: ${msg}`, "error");
    }
  }, [funcInput, pushUndo, updateObjectCount, showToast, activeColor, activeDash]);

  // ---------------------------------------------------------------------------
  // Add parametric curve x(t), y(t)
  // ---------------------------------------------------------------------------

  const handleAddParametricCurve = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;

    const xtMf = xtFieldRef.current as any;
    const ytMf = ytFieldRef.current as any;
    const xtLatex = xtMf?.value || "";
    const ytLatex = ytMf?.value || "";
    if (!xtLatex && !ytLatex) return;

    try {
      const xtExpr = latexToJs(xtLatex || "0");
      const ytExpr = latexToJs(ytLatex || "0");
      // eslint-disable-next-line no-new-func
      const xtFn = new Function("t", `return (${xtExpr})`);
      // eslint-disable-next-line no-new-func
      const ytFn = new Function("t", `return (${ytExpr})`);
      xtFn(0); ytFn(0); // sanity check

      // Parse t range — support "π" and "pi" in input
      const parseTVal = (s: string): number => {
        const cleaned = s.trim().replace(/π/g, "Math.PI").replace(/\bpi\b/gi, "Math.PI");
        // eslint-disable-next-line no-new-func
        return new Function(`return (${cleaned})`)() as number;
      };
      const tMin = parseTVal(tMinInput) || 0;
      const tMax = parseTVal(tMaxInput) || 2 * Math.PI;

      pushUndo();
      const curve = board.create("curve", [xtFn, ytFn, tMin, tMax], {
        ...getLineAttrs(activeColor, activeDash),
        strokeWidth: 2.5,
        name: "",
      });
      (curve as any)._xtExpression = xtExpr;
      (curve as any)._ytExpression = ytExpr;
      (curve as any)._xtLatex = xtLatex;
      (curve as any)._ytLatex = ytLatex;
      (curve as any)._tMin = tMin;
      (curve as any)._tMax = tMax;
      (curve as any)._curveMode = "parametric";
      if (xtMf) xtMf.value = "";
      if (ytMf) ytMf.value = "";
      updateObjectCount();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      showToast(`Invalid expression: ${msg}`, "error");
    }
  }, [tMinInput, tMaxInput, pushUndo, updateObjectCount, showToast, activeColor, activeDash]);

  // ---------------------------------------------------------------------------
  // Dispatch to correct plot handler based on curve mode
  // ---------------------------------------------------------------------------

  const handlePlot = useCallback(() => {
    switch (curveMode) {
      case "fx": handleAddFunction(); break;
      case "implicit": handleAddImplicitCurve(); break;
      case "parametric": handleAddParametricCurve(); break;
    }
  }, [curveMode, handleAddFunction, handleAddImplicitCurve, handleAddParametricCurve]);

  // ---------------------------------------------------------------------------
  // Add point at exact coordinates
  // ---------------------------------------------------------------------------

  const handleAddPoint = useCallback(() => {
    const board = boardRef.current;
    if (!board || !coordInput.trim()) return;
    const parts = coordInput.split(",").map((s) => parseFloat(s.trim()));
    if (parts.length !== 2 || parts.some(isNaN)) return;
    pushUndo();
    board.create("point", [parts[0], parts[1]], {
      ...getPointAttrs(activeColor),
      name: nextPointName(),
      snapToGrid,
      label: { strokeColor: isDark() ? "#e3d5c5" : "#1f2937", display: "internal" },
    });
    setCoordInput("");
    updateObjectCount();
  }, [coordInput, pushUndo, updateObjectCount, nextPointName, snapToGrid, activeColor, isDark]);

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
  // Rename selected point
  // ---------------------------------------------------------------------------

  const handleApplyNameEdit = useCallback(() => {
    if (!selectedEl || selectedEl.elType !== "point") return;
    const name = editName.trim();
    selectedEl.setName(name);
    if (selectedEl.label) {
      selectedEl.label.setAttribute({ visible: !!name });
    }
    boardRef.current?.update();
  }, [selectedEl, editName]);

  // ---------------------------------------------------------------------------
  // Delete selected element
  // ---------------------------------------------------------------------------

  const handleDeleteSelected = useCallback(() => {
    const board = boardRef.current;
    if (!board || !selectedEl) return;
    clearGroupSelection(board);
    pushUndo();
    board.removeObject(selectedEl);
    setSelectedEl(null);
    setEditCoords("");
    setEditName("");
    updateObjectCount();
  }, [selectedEl, pushUndo, updateObjectCount, clearGroupSelection]);

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

  const handleExportPng = useCallback(async () => {
    const board = boardRef.current;
    if (!board) return;
    try {
      const blob = await exportBoardPng(board);
      downloadBlob(blob, "geometry.png");
    } catch {
      showToast("Failed to export PNG", "error");
    }
  }, [showToast]);

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
          const board = boardRef.current;
          if (board) clearGroupSelection(board);
          setSelectedEl(null);
          setEditCoords("");
          setEditName("");
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
    [onClose, handleInsert, handleUndo, handleRedo, selectedEl, handleDeleteSelected, clearGroupSelection]
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="geometry-editor-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40">
          <h3 id="geometry-editor-title" className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {isEditing ? "Edit Diagram" : "Create Diagram"}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
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
              aria-label={t.label}
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
            aria-label="Undo"
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] rounded-lg transition-colors disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoCount === 0}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] rounded-lg transition-colors disabled:opacity-30"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            onClick={handleClear}
            title="Clear all"
            aria-label="Clear all"
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 rounded-lg transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>

          <div className="w-px h-5 bg-[#e8d4b8]/60 dark:bg-[#6b5a4a]/60 mx-1" />

          <button
            onClick={() => setSnapToGrid((s) => !s)}
            title={snapToGrid ? "Snap to grid (on)" : "Snap to grid (off)"}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              snapToGrid
                ? "text-[#a0704b] bg-[#f5ede3] dark:bg-[#3d3628]"
                : "text-gray-400 dark:text-gray-500 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
            )}
          >
            <Grid3x3 className="h-4 w-4" />
          </button>

          <div className="w-px h-5 bg-[#e8d4b8]/60 dark:bg-[#6b5a4a]/60 mx-1" />

          {/* Color palette */}
          <div className="flex items-center gap-0.5">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c.color}
                onClick={() => setActiveColor(c.color)}
                title={c.label}
                className={cn(
                  "w-5 h-5 rounded-full border-2 transition-all",
                  activeColor === c.color
                    ? "border-gray-800 dark:border-white scale-110"
                    : "border-transparent hover:border-gray-300 dark:hover:border-gray-600"
                )}
                style={{ backgroundColor: c.color }}
              />
            ))}
          </div>

          <div className="w-px h-5 bg-[#e8d4b8]/60 dark:bg-[#6b5a4a]/60 mx-1" />

          {/* Line style toggle */}
          <button
            onClick={() => {
              const cycle = [0, 2, 3];
              const idx = cycle.indexOf(activeDash);
              setActiveDash(cycle[(idx + 1) % cycle.length]);
            }}
            title={`Line style: ${activeDash === 0 ? "Solid" : activeDash === 2 ? "Dashed" : "Dotted"}`}
            className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] rounded-lg transition-colors"
          >
            <svg width="20" height="12" viewBox="0 0 20 12" className="text-current">
              {activeDash === 0 && <line x1="2" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="2" />}
              {activeDash === 2 && <line x1="2" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />}
              {activeDash === 3 && <line x1="2" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="2" strokeDasharray="1 3" strokeLinecap="round" />}
            </svg>
          </button>

          <div className="w-px h-5 bg-[#e8d4b8]/60 dark:bg-[#6b5a4a]/60 mx-1" />

          {/* Shape presets dropdown */}
          <div className="relative" ref={shapeMenuRef}>
            <button
              onClick={() => setShapeMenuOpen((v) => !v)}
              title="Shape presets"
              className={cn(
                "flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg transition-colors",
                shapePreset
                  ? "bg-[#a0704b] text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
              )}
            >
              <Shapes className="h-4 w-4" />
              <span className="hidden sm:inline">Shapes</span>
            </button>
            {shapeMenuOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#2a2a2a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg py-1 z-10 min-w-[170px]">
                {[
                  { id: "rectangle", label: "Rectangle" },
                  { id: "equilateral-triangle", label: "Equilateral Triangle" },
                  { id: "pentagon", label: "Pentagon" },
                  { id: "hexagon", label: "Hexagon" },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setShapePreset(s.id);
                      setShapeMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
                  >
                    {s.label}
                  </button>
                ))}
                {shapePreset && (
                  <>
                    <div className="border-t border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 my-1" />
                    <button
                      onClick={() => {
                        setShapePreset(null);
                        setShapeMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
                    >
                      Cancel placement
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Function input bar — shown when function tool is active */}
        {tool === "function" && (
          <div className="flex flex-col border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 bg-[#faf6f1]/50 dark:bg-[#1e1a15]/50">
            {/* Curve mode selector */}
            <div className="flex items-center gap-1 px-4 pt-2 pb-1">
              {([
                { mode: "fx" as CurveMode, label: "f(x)" },
                { mode: "implicit" as CurveMode, label: "f(x,y)=0" },
                { mode: "parametric" as CurveMode, label: "x(t), y(t)" },
              ]).map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() => setCurveMode(mode)}
                  className={cn(
                    "px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors",
                    curveMode === mode
                      ? "bg-[#a0704b] text-white"
                      : "text-gray-500 dark:text-gray-400 hover:bg-[#e8d4b8]/30 dark:hover:bg-[#6b5a4a]/30"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Input fields per mode */}
            <div className="flex items-center gap-2 px-4 py-2">
              {curveMode === "parametric" ? (
                /* Parametric mode: x(t) and y(t) fields + t range */
                <>
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">
                        x(t) =
                      </span>
                      {mathFieldLoaded ? (
                        <math-field
                          ref={xtFieldRef as any}
                          aria-label="x(t) expression"
                          onKeyDown={(e: React.KeyboardEvent) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              e.stopPropagation();
                              // Move focus to y(t) field
                              const ytMf = ytFieldRef.current as any;
                              if (ytMf) ytMf.focus();
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
                        <input type="text" placeholder="Loading..." className="flex-1 px-2 py-1 text-xs font-mono bg-white dark:bg-[#2a2518] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-md outline-none text-gray-800 dark:text-gray-200" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">
                        y(t) =
                      </span>
                      {mathFieldLoaded ? (
                        <math-field
                          ref={ytFieldRef as any}
                          aria-label="y(t) expression"
                          onKeyDown={(e: React.KeyboardEvent) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              e.stopPropagation();
                              handleAddParametricCurve();
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
                        <input type="text" placeholder="Loading..." className="flex-1 px-2 py-1 text-xs font-mono bg-white dark:bg-[#2a2518] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-md outline-none text-gray-800 dark:text-gray-200" />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">t:</span>
                      <input
                        type="text"
                        value={tMinInput}
                        onChange={(e) => setTMinInput(e.target.value)}
                        className="w-10 px-1 py-0.5 text-[10px] font-mono text-center bg-white dark:bg-[#2a2518] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded outline-none text-gray-800 dark:text-gray-200"
                      />
                      <span className="text-[10px] text-gray-400">to</span>
                      <input
                        type="text"
                        value={tMaxInput}
                        onChange={(e) => setTMaxInput(e.target.value)}
                        className="w-10 px-1 py-0.5 text-[10px] font-mono text-center bg-white dark:bg-[#2a2518] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded outline-none text-gray-800 dark:text-gray-200"
                      />
                    </div>
                    <button
                      onClick={handleAddParametricCurve}
                      className="px-3 py-1 text-xs font-medium bg-[#a0704b] text-white rounded-md hover:bg-[#8b5f3c] disabled:opacity-40 transition-colors"
                    >
                      Plot
                    </button>
                  </div>
                </>
              ) : (
                /* f(x) and implicit modes: single math field */
                <>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">
                    {curveMode === "implicit" ? "f(x,y) =" : "f(x) ="}
                  </span>
                  {mathFieldLoaded ? (
                    <math-field
                      ref={funcFieldRef as any}
                      aria-label={curveMode === "implicit" ? "Implicit curve expression" : "Function expression"}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.stopPropagation();
                          handlePlot();
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
                          handlePlot();
                        }
                      }}
                      placeholder="Loading math input..."
                      className="flex-1 px-2 py-1 text-xs font-mono bg-white dark:bg-[#2a2518] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-md outline-none focus:ring-1 focus:ring-[#a0704b] text-gray-800 dark:text-gray-200"
                    />
                  )}
                  <button
                    onClick={handlePlot}
                    className="px-3 py-1 text-xs font-medium bg-[#a0704b] text-white rounded-md hover:bg-[#8b5f3c] disabled:opacity-40 transition-colors"
                  >
                    Plot
                  </button>
                </>
              )}
            </div>

            {/* Hint text */}
            {curveMode === "implicit" && (
              <div className="px-4 pb-1.5 -mt-1">
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  Enter the expression = 0. E.g. x²+y²-1 for a unit circle
                </span>
              </div>
            )}
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

        {/* Angle degree input bar — shown when angle tool is active */}
        {tool === "angle" && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 bg-[#faf6f1]/50 dark:bg-[#1e1a15]/50">
            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
              Degrees:
            </span>
            <input
              type="number"
              min="1"
              max="359"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Optional — e.g. 45 (click vertex, then ray)"
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

        {/* Selected point editor — shown when a point is selected in select mode */}
        {tool === "select" && selectedEl?.elType === "point" && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 bg-[#faf6f1]/50 dark:bg-[#1e1a15]/50">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleApplyNameEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleApplyNameEdit();
                }
              }}
              placeholder="Name"
              className="w-16 px-2 py-1 text-xs bg-white dark:bg-[#2a2518] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-md outline-none focus:ring-1 focus:ring-[#a0704b] text-gray-800 dark:text-gray-200"
            />
            <span className="text-xs text-gray-400 dark:text-gray-500">at</span>
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
            <div className="flex items-center gap-0.5 ml-1">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.color}
                  onClick={() => {
                    pushUndo();
                    selectedEl.setAttribute({ strokeColor: c.color, fillColor: c.color });
                    if (selectedEl.label) {
                      selectedEl.label.setAttribute({ strokeColor: isDark() ? "#e3d5c5" : "#1f2937" });
                    }
                    boardRef.current?.update();
                  }}
                  className="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-600 hover:scale-125 transition-transform"
                  style={{ backgroundColor: c.color }}
                />
              ))}
            </div>
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
            >
              <Trash2 className="h-3 w-3" />
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
            {getElementPoints(boardRef.current, selectedEl).length >= 2 && (
              <span className="text-[10px] text-[#a0704b] dark:text-[#c9a96e] ml-1">Drag any point to move</span>
            )}
            <div className="flex items-center gap-0.5 ml-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.color}
                  onClick={() => {
                    pushUndo();
                    selectedEl.setAttribute({ strokeColor: c.color });
                    if (selectedEl.elType === "polygon") {
                      selectedEl.setAttribute({ fillColor: `${c.color}26` });
                      // Also update polygon border segments
                      if (selectedEl.borders) {
                        selectedEl.borders.forEach((b: any) => b?.setAttribute({ strokeColor: c.color }));
                      }
                    }
                    boardRef.current?.update();
                  }}
                  className="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-600 hover:scale-125 transition-transform"
                  style={{ backgroundColor: c.color }}
                />
              ))}
            </div>
            {["line", "segment", "circle", "polygon", "functiongraph", "curve"].includes(selectedEl.elType) && (
              <div className="flex items-center gap-0.5 ml-1">
                {[0, 2, 3].map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      pushUndo();
                      selectedEl.setAttribute({ dash: d });
                      if (selectedEl.elType === "polygon" && selectedEl.borders) {
                        selectedEl.borders.forEach((b: any) => b?.setAttribute({ dash: d }));
                      }
                      boardRef.current?.update();
                    }}
                    title={d === 0 ? "Solid" : d === 2 ? "Dashed" : "Dotted"}
                    className={cn(
                      "p-1 rounded transition-colors",
                      (selectedEl.visProp?.dash || 0) === d
                        ? "bg-[#f5ede3] dark:bg-[#3d3628]"
                        : "hover:bg-gray-100 dark:hover:bg-gray-800"
                    )}
                  >
                    <svg width="16" height="8" viewBox="0 0 16 8" className="text-gray-600 dark:text-gray-400">
                      {d === 0 && <line x1="1" y1="4" x2="15" y2="4" stroke="currentColor" strokeWidth="2" />}
                      {d === 2 && <line x1="1" y1="4" x2="15" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />}
                      {d === 3 && <line x1="1" y1="4" x2="15" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray="1 2" strokeLinecap="round" />}
                    </svg>
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1" />
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        )}

        {/* Tool hint */}
        <div className="flex items-center px-4 py-1 text-[10px] text-gray-400 dark:text-gray-500">
          <span>
            {shapePreset
              ? "Click on the board to place the shape"
              : tool === "polygon" && pendingCount >= 3
                ? "Click to add vertices \u00B7 Double-click or press Close to finish"
                : TOOLS.find((t) => t.id === tool)?.hint}
          </span>
          {pendingCount > 0 && (
            <span className="ml-2 text-[#a0704b]">
              {pendingCount} point{pendingCount !== 1 ? "s" : ""} pending
            </span>
          )}
          {tool === "polygon" && pendingCount >= 3 && (
            <button
              onClick={handleClosePolygon}
              className="ml-auto px-2.5 py-0.5 text-[10px] font-medium bg-[#a0704b] text-white rounded hover:bg-[#8b5f3c] transition-colors"
            >
              Close Polygon
            </button>
          )}
        </div>

        {/* Board container */}
        <div className="flex-1 min-h-0 px-3 pb-2">
          {jsxLoaded ? (
            <div className="relative">
              <div
                ref={containerRef}
                className="w-full rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden"
                style={{ height: "400px", touchAction: "manipulation", cursor: isPanning ? "grabbing" : tool === "select" ? "default" : tool === "function" ? "default" : "crosshair" }}
              />
              {selectionRect && boardRef.current && (() => {
                const board = boardRef.current;
                const ox = board.origin.scrCoords[1];
                const oy = board.origin.scrCoords[2];
                const ux = board.unitX;
                const uy = board.unitY;
                const px1 = ox + selectionRect.x1 * ux;
                const py1 = oy - selectionRect.y1 * uy;
                const px2 = ox + selectionRect.x2 * ux;
                const py2 = oy - selectionRect.y2 * uy;
                const left = Math.min(px1, px2);
                const top = Math.min(py1, py2);
                const width = Math.abs(px2 - px1);
                const height = Math.abs(py2 - py1);
                return (
                  <div
                    style={{
                      position: "absolute",
                      left, top, width, height,
                      border: "1.5px dashed #3b82f6",
                      backgroundColor: "rgba(59, 130, 246, 0.08)",
                      borderRadius: "3px",
                      pointerEvents: "none",
                    }}
                  />
                );
              })()}
            </div>
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
            <button
              onClick={handleExportPng}
              disabled={objectCount === 0}
              title="Export as PNG"
              className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors disabled:opacity-30"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">PNG</span>
            </button>
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
