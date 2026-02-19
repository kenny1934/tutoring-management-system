import { Fragment } from "react";
import type { DocumentHeaderFooter } from "@/types";

interface PageHeaderProps {
  section?: DocumentHeaderFooter;
  docTitle: string;
  pageNumber: number;
}

function resolveText(template: string, docTitle: string, pageNumber: number): string {
  if (!template) return "";
  return template
    .replace(/\{title\}/g, docTitle)
    .replace(/\{date\}/g, new Date().toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    }))
    .replace(/\{page\}/g, String(pageNumber));
}

export function PageHeader({ section, docTitle, pageNumber }: PageHeaderProps) {
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
        fontSize: "9px",
        color: "#888",
        pointerEvents: "none",
        userSelect: "none",
        paddingBottom: "4px",
        borderBottom: "0.5px solid #ddd",
        marginBottom: "1em",
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
