"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { deserializeToBoard, type GeometryState } from "@/lib/geometry-utils";

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
  const [jsxLoaded, setJsxLoaded] = useState(false);
  const boardRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const JXGRef = useRef<any>(null);

  // Lazy-load JSXGraph
  useEffect(() => {
    if (!isOpen || jsxLoaded) return;
    import("jsxgraph").then((mod) => {
      JXGRef.current = (mod as any).default || mod;
      setJsxLoaded(true);
    });
  }, [isOpen, jsxLoaded]);

  const isDark = useCallback(() => {
    return (
      document.documentElement.classList.contains("dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  }, []);

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

    const dark = isDark();
    const axisColor = dark ? "#a0907a" : "#6b5a4a";
    const tickColor = dark ? "#4a3d30" : "#d4c0a8";
    const gridColor = dark ? "#3d3628" : "#e8d4b8";

    const board = JXG.JSXGraph.initBoard(containerRef.current, {
      boundingbox: state.boundingBox,
      axis: true,
      showCopyright: false,
      showNavigation: false,
      pan: { enabled: true, needTwoFingers: false },
      zoom: { factorX: 1.25, factorY: 1.25, wheel: true, needShift: false },
      defaultAxes: {
        x: { strokeColor: axisColor, highlightStrokeColor: axisColor,
             ticks: { strokeColor: tickColor, minorTicks: 0 } },
        y: { strokeColor: axisColor, highlightStrokeColor: axisColor,
             ticks: { strokeColor: tickColor, minorTicks: 0 } },
      },
      grid: { strokeColor: gridColor, strokeOpacity: 0.6 },
      renderer: "svg",
      document: document,
      keepAspectRatio: false,
    });

    if (dark && containerRef.current) {
      containerRef.current.style.backgroundColor = "#2a2a2a";
    } else if (containerRef.current) {
      containerRef.current.style.backgroundColor = "#ffffff";
    }

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

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40 text-center">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            Scroll to zoom · drag to pan
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
