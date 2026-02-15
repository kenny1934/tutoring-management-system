"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { useTheme } from "next-themes";
import { deserializeToBoard, createThemedBoard, applyBoardTheme, type GeometryState } from "@/lib/geometry-utils";

interface GeometryViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  graphJson: string;
}

export default function GeometryViewerModal({
  isOpen,
  onClose,
  graphJson,
}: GeometryViewerModalProps) {
  const { resolvedTheme } = useTheme();
  const [jsxLoaded, setJsxLoaded] = useState(false);
  const boardRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const JXGRef = useRef<any>(null);
  const themeInitRef = useRef(false);
  const initialBBRef = useRef<[number, number, number, number]>([-8, 6, 8, -6]);

  // Lazy-load JSXGraph
  useEffect(() => {
    if (!isOpen || jsxLoaded) return;
    import("jsxgraph").then((mod) => {
      JXGRef.current = (mod as any).default || mod;
      setJsxLoaded(true);
    });
  }, [isOpen, jsxLoaded]);

  const isDark = resolvedTheme === "dark";

  // Init board when modal opens
  useEffect(() => {
    if (!jsxLoaded || !isOpen || !containerRef.current || !graphJson) return;
    const JXG = JXGRef.current;
    if (!JXG) return;

    if (boardRef.current) {
      JXG.JSXGraph.freeBoard(boardRef.current);
      boardRef.current = null;
    }

    let state: GeometryState;
    try {
      state = JSON.parse(graphJson);
    } catch {
      return;
    }

    initialBBRef.current = state.boundingBox;
    const board = createThemedBoard(JXG, containerRef.current, state.boundingBox, isDark);
    if (!board) return;

    boardRef.current = board;
    deserializeToBoard(board, state, true);

    return () => {
      if (boardRef.current) {
        JXG.JSXGraph.freeBoard(boardRef.current);
        boardRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsxLoaded, isOpen, graphJson]);

  // Re-theme board when app theme changes
  useEffect(() => {
    const board = boardRef.current;
    if (!board || !containerRef.current) return;

    // Skip the initial render
    if (!themeInitRef.current) {
      themeInitRef.current = true;
      return;
    }

    applyBoardTheme(board, containerRef.current, resolvedTheme === "dark");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme]);

  const handleZoomReset = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    board.setBoundingBox(initialBBRef.current, true);
    board.fullUpdate();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

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
        style={{ maxWidth: "52rem", maxHeight: "80vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Interactive Diagram
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Board */}
        <div className="flex-1 min-h-0 p-3">
          {jsxLoaded ? (
            <div
              ref={containerRef}
              className="w-full rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden"
              style={{ height: "450px" }}
            />
          ) : (
            <div className="flex items-center justify-center h-[450px] text-sm text-gray-400">
              Loading viewer...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40">
          <div className="flex items-center gap-2">
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
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            Scroll to zoom · drag to pan
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
