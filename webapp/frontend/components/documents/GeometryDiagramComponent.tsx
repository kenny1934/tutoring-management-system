"use client";

import { useRef, useState, useCallback } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import { Pencil } from "lucide-react";
import { ResizableNodeWrapper } from "./ResizableNodeWrapper";

interface GeometryDiagramProps {
  node: { attrs: Record<string, unknown> };
  selected: boolean;
  updateAttributes: (attrs: Record<string, unknown>) => void;
  extension: { options: { onEdit?: (graphJson: string, pos: number) => void } };
  getPos: () => number | undefined;
}

export function GeometryDiagramComponent({
  node,
  selected,
  updateAttributes,
  extension,
  getPos,
}: GeometryDiagramProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [aspectRatio, setAspectRatio] = useState<number | undefined>();

  const svgThumbnail = node.attrs.svgThumbnail as string;
  const graphJson = node.attrs.graphJson as string;

  const handleDoubleClick = useCallback(() => {
    const onEdit = extension.options.onEdit;
    if (!onEdit) return;
    const pos = getPos();
    if (pos != null) {
      onEdit(graphJson || "{}", pos);
    }
  }, [extension.options.onEdit, getPos, graphJson]);

  return (
    <NodeViewWrapper data-drag-handle>
      <ResizableNodeWrapper
        width={node.attrs.width as number | null}
        align={node.attrs.align as "left" | "center" | "right" | "wrap-left" | "wrap-right" | null}
        selected={selected}
        updateAttributes={updateAttributes}
        aspectRatio={aspectRatio}
      >
        <div
          onDoubleClick={handleDoubleClick}
          style={{ cursor: "pointer", width: "100%", position: "relative" }}
        >
          {svgThumbnail ? (
            <img
              ref={imgRef}
              src={svgThumbnail}
              alt="Geometry diagram"
              style={{
                width: "100%",
                height: "auto",
                borderRadius: 8,
                border: "1px solid #e8d4b8",
                display: "block",
              }}
              draggable={false}
              onLoad={() => {
                if (imgRef.current) {
                  const { naturalWidth, naturalHeight } = imgRef.current;
                  if (naturalWidth && naturalHeight) {
                    setAspectRatio(naturalWidth / naturalHeight);
                  }
                }
              }}
            />
          ) : (
            <span style={{ color: "#999", fontSize: 12 }}>
              [Geometry Diagram]
            </span>
          )}
          {/* Edit hint — shown when selected */}
          {selected && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 bg-black/60 text-white text-[10px] rounded-md pointer-events-none print:hidden">
              <Pencil className="w-3 h-3" />
              Double-click to edit
            </div>
          )}
        </div>
      </ResizableNodeWrapper>
    </NodeViewWrapper>
  );
}
