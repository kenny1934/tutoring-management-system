/**
 * TipTap custom node for geometry diagrams.
 * Stores a JSXGraph serialized state (graphJson) and an SVG thumbnail.
 * Renders the thumbnail in the editor; clicking opens the geometry editor.
 */
import { Node as TipTapNode } from "@tiptap/core";

interface GeometryDiagramOptions {
  /** Called when user clicks a diagram to edit it. Receives (graphJson, nodePos). */
  onEdit?: (graphJson: string, pos: number) => void;
}

export function createGeometryDiagramNode(options: GeometryDiagramOptions = {}) {
  return TipTapNode.create({
    name: "geometryDiagram",
    group: "block",
    atom: true,
    draggable: true,

    addAttributes() {
      return {
        graphJson: { default: "{}" },
        svgThumbnail: { default: "" },
      };
    },

    parseHTML() {
      return [
        {
          tag: 'div[data-type="geometry-diagram"]',
          getAttrs: (dom: HTMLElement) => ({
            graphJson: dom.getAttribute("data-graph-json") || "{}",
            svgThumbnail: dom.getAttribute("data-svg-thumbnail") || "",
          }),
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      const thumb = HTMLAttributes.svgThumbnail || "";
      return [
        "div",
        {
          "data-type": "geometry-diagram",
          "data-graph-json": HTMLAttributes.graphJson,
          "data-svg-thumbnail": thumb,
          style: "cursor:pointer;text-align:center;padding:8px 0;margin:4px 0",
        },
        thumb
          ? [
              "img",
              {
                src: thumb,
                alt: "Geometry diagram",
                style:
                  "max-width:100%;max-height:200px;height:auto;object-fit:contain;border-radius:8px;border:1px solid #e8d4b8",
              },
            ]
          : ["span", { style: "color:#999;font-size:12px" }, "[Geometry Diagram]"],
      ];
    },

    addNodeView() {
      return ({ node, getPos }) => {
        const dom = document.createElement("div");
        dom.setAttribute("data-type", "geometry-diagram");
        dom.style.cursor = "pointer";
        dom.style.textAlign = "center";
        dom.style.padding = "8px 0";
        dom.style.margin = "4px 0";

        const thumb = node.attrs.svgThumbnail;
        if (thumb) {
          const img = document.createElement("img");
          img.src = thumb;
          img.alt = "Geometry diagram";
          img.style.maxWidth = "100%";
          img.style.borderRadius = "8px";
          img.style.border = "1px solid #e8d4b8";
          dom.appendChild(img);
        } else {
          dom.textContent = "[Geometry Diagram]";
          dom.style.color = "#999";
          dom.style.fontSize = "12px";
        }

        if (options.onEdit) {
          dom.addEventListener("click", () => {
            const pos = typeof getPos === "function" ? getPos() : null;
            if (pos == null) return;
            options.onEdit!(node.attrs.graphJson || "{}", pos);
          });
        }

        return { dom };
      };
    },
  });
}
