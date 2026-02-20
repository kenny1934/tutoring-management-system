import type { DocumentHeaderFooter } from "@/types";
import { buildHFontFamily, resolveText } from "@/lib/tiptap-extensions/pagination-utils";

interface PageFooterProps {
  section?: DocumentHeaderFooter;
  docTitle: string;
  pageNumber: number;
}

export function PageFooter({ section, docTitle, pageNumber }: PageFooterProps) {
  if (!section?.enabled) return null;

  const cells = [
    { text: section.left, align: "left" as const },
    { text: section.center, align: "center" as const },
    { text: section.right, align: "right" as const },
  ];

  return (
    <div
      className="page-footer-content"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: `${section.fontSize ?? 9}px`,
        fontFamily: buildHFontFamily(section.fontFamily, section.fontFamilyCjk),
        lineHeight: "normal",
        color: "#888",
        pointerEvents: "none",
        userSelect: "none",
        paddingTop: "4px",
        borderTop: "0.5px solid #ddd",
      }}
    >
      {cells.map((cell, i) => (
        <span
          key={i}
          style={{
            flex: 1,
            textAlign: cell.align,
          }}
        >
          {section.imageUrl && section.imagePosition === cell.align && cell.align !== "right" && (
            <img
              src={section.imageUrl}
              alt=""
              style={{
                maxHeight: "10mm",
                width: "auto",
                display: "inline-block",
                verticalAlign: "middle",
                marginRight: "4px",
              }}
            />
          )}
          {cell.text && resolveText(cell.text, docTitle, pageNumber)}
          {section.imageUrl && section.imagePosition === cell.align && cell.align === "right" && (
            <img
              src={section.imageUrl}
              alt=""
              style={{
                maxHeight: "10mm",
                width: "auto",
                display: "inline-block",
                verticalAlign: "middle",
                marginLeft: "4px",
              }}
            />
          )}
        </span>
      ))}
    </div>
  );
}
