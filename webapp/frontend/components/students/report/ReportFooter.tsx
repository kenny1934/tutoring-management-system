import type { ReportMode } from "../ProgressReport";

interface ReportFooterProps {
  generatedBy?: string;
  generatedAt?: string;
  mode: ReportMode;
}

export function ReportFooter({ generatedBy, generatedAt, mode }: ReportFooterProps) {
  const dateStr = (generatedAt ? new Date(generatedAt) : new Date()).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="mt-8 pt-3 border-t border-[#e8d4b8] text-xs text-gray-400 flex flex-col gap-1 md:flex-row md:justify-between">
      <span>
        Generated on {dateStr}
        {generatedBy && mode === "internal" && ` by ${generatedBy}`}
      </span>
      <span>
        {mode === "internal" ? "Confidential — Internal Use Only" : "MathConcept Secondary Academy"}
      </span>
    </div>
  );
}
