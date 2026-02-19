"use client";

import { useRef, useState } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import { ResizableNodeWrapper } from "./ResizableNodeWrapper";

interface ResizableImageProps {
  node: { attrs: Record<string, unknown> };
  selected: boolean;
  updateAttributes: (attrs: Record<string, unknown>) => void;
}

export function ResizableImageComponent({ node, selected, updateAttributes }: ResizableImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [aspectRatio, setAspectRatio] = useState<number | undefined>();

  return (
    <NodeViewWrapper data-drag-handle>
      <ResizableNodeWrapper
        width={node.attrs.width as number | null}
        align={node.attrs.align as "left" | "center" | "right" | "wrap-left" | "wrap-right" | null}
        selected={selected}
        updateAttributes={updateAttributes}
        aspectRatio={aspectRatio}
      >
        <img
          ref={imgRef}
          src={node.attrs.src as string}
          alt={(node.attrs.alt as string) || ""}
          title={(node.attrs.title as string) || ""}
          className="document-image"
          style={{ width: "100%", height: "auto", display: "block" }}
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
      </ResizableNodeWrapper>
    </NodeViewWrapper>
  );
}
