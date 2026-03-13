interface ReportHeaderProps {
  dateRangeLabel: string;
}

export function ReportHeader({ dateRangeLabel }: ReportHeaderProps) {
  return (
    <div className="text-center mb-6 pb-4 border-b-2 border-[#a0704b]">
      <h1 className="text-2xl font-bold text-[#a0704b] tracking-wide">
        Math Concept Secondary
      </h1>
      <h2 className="text-lg font-semibold text-gray-700 mt-1">
        Student Progress Report
      </h2>
      <p className="text-sm text-gray-500 mt-1">{dateRangeLabel}</p>
    </div>
  );
}
