/**
 * TipTap custom node for geometry diagrams.
 * Stores a JSXGraph serialized state (graphJson) and an SVG thumbnail.
 * Renders the thumbnail in the editor; clicking opens the geometry editor.
 * Uses React NodeView with ResizableNodeWrapper for resize + alignment.
 */
import { Node as TipTapNode } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { GeometryDiagramComponent } from "@/components/documents/GeometryDiagramComponent";

interface GeometryDiagramOptions {
  /** Called when user clicks a diagram to edit it. Receives (graphJson, nodePos). */
  onEdit?: (graphJson: string, pos: number) => void;
}

export function createGeometryDiagramNode(options: GeometryDiagramOptions = {}) {
  return TipTapNode.create<GeometryDiagramOptions>({
    name: "geometryDiagram",
    group: "block",
    atom: true,
    draggable: true,

    addOptions() {
      return options;
    },

    addAttributes() {
      return {
        graphJson: { default: "{}" },
        svgThumbnail: { default: "" },
        width: {
          default: null,
          parseHTML: (element: HTMLElement) => {
            const w = element.getAttribute("data-width");
            return w ? parseInt(w, 10) || null : null;
          },
          renderHTML: (attributes: Record<string, unknown>) => {
            if (!attributes.width) return {};
            return { "data-width": String(attributes.width) };
          },
        },
        align: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-align") || null,
          renderHTML: (attributes: Record<string, unknown>) => {
            if (!attributes.align) return {};
            return { "data-align": attributes.align };
          },
        },
      };
    },

    parseHTML() {
      return [
        {
          tag: 'div[data-type="geometry-diagram"]',
          getAttrs: (dom: HTMLElement) => ({
            graphJson: dom.getAttribute("data-graph-json") || "{}",
            svgThumbnail: dom.getAttribute("data-svg-thumbnail") || "",
            width: dom.getAttribute("data-width") ? parseInt(dom.getAttribute("data-width")!, 10) || null : null,
            align: dom.getAttribute("data-align") || null,
          }),
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      const thumb = (HTMLAttributes.svgThumbnail || "") as string;

      // Check both raw and rendered attribute forms for data-width/data-align
      // (TipTap may pass either form depending on version — this improves copy-paste preservation)
      const width = (HTMLAttributes.width as number | null) ??
        (HTMLAttributes["data-width"] ? parseInt(HTMLAttributes["data-width"] as string, 10) || null : null);
      const align = (HTMLAttributes.align as string | null) ??
        (HTMLAttributes["data-align"] as string | null) ?? null;

      const attrs: Record<string, string> = {
        "data-type": "geometry-diagram",
        "data-graph-json": (HTMLAttributes.graphJson as string) || "{}",
        "data-svg-thumbnail": thumb,
      };
      if (width) attrs["data-width"] = String(width);
      if (align) attrs["data-align"] = align;
      // Width/align inline styles for PDF are applied in buildPdfHtml via ProseMirror state

      return [
        "div",
        attrs,
        thumb
          ? [
              "img",
              {
                src: thumb,
                alt: "Geometry diagram",
                style:
                  "width:100%;height:auto;object-fit:contain;border-radius:8px;border:1px solid #e8d4b8",
              },
            ]
          : ["span", { style: "color:#999;font-size:12px" }, "[Geometry Diagram]"],
      ];
    },

    addNodeView() {
      return ReactNodeViewRenderer(GeometryDiagramComponent);
    },
  });
}
