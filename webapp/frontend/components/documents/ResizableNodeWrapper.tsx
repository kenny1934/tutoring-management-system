"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { AlignLeft, AlignCenter, AlignRight, PanelLeft, PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";

type AlignMode = "left" | "center" | "right" | "wrap-left" | "wrap-right";

interface ResizableNodeWrapperProps {
  width: number | null;
  align: AlignMode | null;
  selected: boolean;
  updateAttributes: (attrs: Record<string, unknown>) => void;
  children: React.ReactNode;
  aspectRatio?: number;
  minWidth?: number;
}

const BLOCK_ALIGN_BUTTONS: { value: AlignMode; Icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { value: "left", Icon: AlignLeft, label: "Align left" },
  { value: "center", Icon: AlignCenter, label: "Center" },
  { value: "right", Icon: AlignRight, label: "Align right" },
];

const WRAP_BUTTONS: { value: AlignMode; Icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { value: "wrap-left", Icon: PanelLeft, label: "Wrap text right" },
  { value: "wrap-right", Icon: PanelRight, label: "Wrap text left" },
];

export function ResizableNodeWrapper({
  width,
  align,
  selected,
  updateAttributes,
  children,
  aspectRatio,
  minWidth = 50,
}: ResizableNodeWrapperProps) {
  const [localWidth, setLocalWidth] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const directionRef = useRef("");
  const cleanupRef = useRef<(() => void) | null>(null);

  const displayWidth = localWidth ?? width;
  const effectiveAlign: AlignMode = align ?? "center";
  const isWrapped = effectiveAlign === "wrap-left" || effectiveAlign === "wrap-right";

  // Clear local width when the committed width changes (e.g. undo/redo)
  useEffect(() => {
    setLocalWidth(null);
  }, [width]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, direction: string) => {
      e.preventDefault();
      e.stopPropagation();

      const el = wrapperRef.current;
      if (!el) return;

      isResizing.current = true;
      directionRef.current = direction;
      startXRef.current = e.clientX;
      startWidthRef.current = el.offsetWidth;

      // Compute max width from parent container
      const parent = el.parentElement;
      const maxWidth = parent ? parent.clientWidth : 800;

      let rafId: number | null = null;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isResizing.current || rafId !== null) return;
        rafId = requestAnimationFrame(() => {
          const dir = directionRef.current;
          const deltaX = ev.clientX - startXRef.current;
          // Right-side handles add delta, left-side subtract
          const sign = dir.includes("r") ? 1 : -1;
          const newWidth = Math.max(
            minWidth,
            Math.min(maxWidth, startWidthRef.current + deltaX * sign)
          );
          setLocalWidth(newWidth);
          rafId = null;
        });
      };

      const cleanup = () => {
        isResizing.current = false;
        if (rafId !== null) cancelAnimationFrame(rafId);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", cleanup);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        cleanupRef.current = null;

        // Commit final width to TipTap
        const el = wrapperRef.current;
        if (el) {
          const finalWidth = el.offsetWidth;
          updateAttributes({ width: Math.round(finalWidth) });
        }
        setLocalWidth(null);
      };

      cleanupRef.current = cleanup;
      document.body.style.cursor = direction.includes("r") ? "nwse-resize" : "nesw-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", cleanup);
    },
    [minWidth, updateAttributes]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const alignStyle: React.CSSProperties = {
    maxWidth: "100%",
    ...(displayWidth != null && { width: `${displayWidth}px` }),
    ...(aspectRatio && displayWidth != null && { height: `${Math.round(displayWidth / aspectRatio)}px` }),
  };

  // Block alignment modes
  if (effectiveAlign === "left") {
    alignStyle.marginRight = "auto";
  } else if (effectiveAlign === "center") {
    alignStyle.marginLeft = "auto";
    alignStyle.marginRight = "auto";
  } else if (effectiveAlign === "right") {
    alignStyle.marginLeft = "auto";
  }
  // Float/wrap modes
  else if (effectiveAlign === "wrap-left") {
    alignStyle.float = "left";
    alignStyle.marginRight = "1em";
    alignStyle.marginBottom = "0.5em";
  } else if (effectiveAlign === "wrap-right") {
    alignStyle.float = "right";
    alignStyle.marginLeft = "1em";
    alignStyle.marginBottom = "0.5em";
  }

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "resizable-node-wrapper relative",
        selected && "selected",
        isWrapped && "resizable-node-wrapped"
      )}
      style={alignStyle}
    >
      {children}

      {/* Resize handles — corners only, visible when selected */}
      {selected && (
        <>
          <div
            className="resize-handle resize-handle-tl print:hidden"
            onMouseDown={(e) => handleResizeStart(e, "tl")}
          />
          <div
            className="resize-handle resize-handle-tr print:hidden"
            onMouseDown={(e) => handleResizeStart(e, "tr")}
          />
          <div
            className="resize-handle resize-handle-bl print:hidden"
            onMouseDown={(e) => handleResizeStart(e, "bl")}
          />
          <div
            className="resize-handle resize-handle-br print:hidden"
            onMouseDown={(e) => handleResizeStart(e, "br")}
          />
        </>
      )}

      {/* Alignment toolbar — visible when selected */}
      {selected && (
        <div className="resizable-align-toolbar absolute -top-9 left-0 flex items-center gap-0.5 bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-md p-0.5 print:hidden z-10">
          {BLOCK_ALIGN_BUTTONS.map(({ value, Icon, label }) => (
            <button
              key={value}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                updateAttributes({ align: value });
              }}
              className={cn(
                "p-1 rounded transition-colors",
                effectiveAlign === value
                  ? "bg-[#a0704b] text-white"
                  : "text-gray-500 dark:text-gray-400 hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
              )}
              title={label}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
          {/* Separator */}
          <div className="w-px h-4 bg-[#e8d4b8] dark:bg-[#6b5a4a] mx-0.5" />
          {WRAP_BUTTONS.map(({ value, Icon, label }) => (
            <button
              key={value}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                updateAttributes({ align: value });
              }}
              className={cn(
                "p-1 rounded transition-colors",
                effectiveAlign === value
                  ? "bg-[#a0704b] text-white"
                  : "text-gray-500 dark:text-gray-400 hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
              )}
              title={label}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
