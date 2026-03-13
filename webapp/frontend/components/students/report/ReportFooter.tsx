interface ReportFooterProps {
  generatedBy?: string;
  mode: "internal" | "parent";
}

export function ReportFooter({ generatedBy, mode }: ReportFooterProps) {
  const now = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="mt-8 pt-3 border-t border-[#e8d4b8] text-xs text-gray-400 flex justify-between">
      <span>
        Generated on {now}
        {generatedBy && mode === "internal" && ` by ${generatedBy}`}
      </span>
      <span>
        {mode === "internal" ? "Confidential — Internal Use Only" : "Math Concept Secondary"}
      </span>
    </div>
  );
}
