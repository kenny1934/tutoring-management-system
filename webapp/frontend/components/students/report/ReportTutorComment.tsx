interface ReportTutorCommentProps {
  comment: string;
}

export function ReportTutorComment({ comment }: ReportTutorCommentProps) {
  if (!comment) return null;

  return (
    <div className="report-section">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Tutor Observations</h3>
      <div className="border-l-4 border-[#a0704b] pl-4 py-2 bg-[#faf6f1] rounded-r text-sm text-gray-700 whitespace-pre-wrap">
        {comment}
      </div>
    </div>
  );
}
