import type { DocumentHeaderFooter } from "@/types";
import { buildHFontFamily, resolveText } from "@/lib/tiptap-extensions/pagination-utils";

interface PageHeaderProps {
  section?: DocumentHeaderFooter;
  docTitle: string;
  pageNumber: number;
  totalPages?: number;
}

export function PageHeader({ section, docTitle, pageNumber, totalPages }: PageHeaderProps) {
  if (!section?.enabled) return null;

  const cells = [
    { text: section.left, align: "left" as const },
    { text: section.center, align: "center" as const },
    { text: section.right, align: "right" as const },
  ];

  return (
    <div
      className="page-header-content"
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
        paddingBottom: "4px",
        borderBottom: "0.5px solid #ddd",
        marginBottom: "9px",
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
          {cell.text && resolveText(cell.text, docTitle, pageNumber, totalPages)}
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
