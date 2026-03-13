interface ReportHeaderProps {
  dateRangeLabel: string;
}

export function ReportHeader({ dateRangeLabel }: ReportHeaderProps) {
  return (
    <div className="flex items-center gap-4 mb-6 pb-4 border-b-2 border-[#a0704b]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/report-logo.png"
        alt="MathConcept Secondary Academy"
        className="h-14 w-auto"
      />
      <div className="flex-1 text-center">
        <h1 className="text-2xl font-bold text-[#a0704b] tracking-wide">
          MathConcept Secondary Academy
        </h1>
        <h2 className="text-lg font-semibold text-gray-700 mt-1">
          Student Progress Report
        </h2>
        <p className="text-sm text-gray-500 mt-1">{dateRangeLabel}</p>
      </div>
      {/* Spacer to balance the logo on the left */}
      <div className="w-14" />
    </div>
  );
}
