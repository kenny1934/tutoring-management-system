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
      const thumb = HTMLAttributes.svgThumbnail || "";
      const attrs: Record<string, string> = {
        "data-type": "geometry-diagram",
        "data-graph-json": HTMLAttributes.graphJson,
        "data-svg-thumbnail": thumb,
      };
      if (HTMLAttributes.width) attrs["data-width"] = String(HTMLAttributes.width);
      if (HTMLAttributes.align) attrs["data-align"] = HTMLAttributes.align;

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
                  "max-width:100%;height:auto;object-fit:contain;border-radius:8px;border:1px solid #e8d4b8",
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
