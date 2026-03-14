import type { Student } from "@/types";

interface ReportStudentInfoProps {
  student: Student;
  generatedBy?: string;
}

export function ReportStudentInfo({ student, generatedBy }: ReportStudentInfoProps) {
  const fields = [
    { label: "Student ID", value: student.school_student_id },
    { label: "Grade", value: student.grade },
    { label: "School", value: student.school },
    { label: "Stream", value: [student.lang_stream, student.academic_stream].filter(Boolean).join(" / ") || undefined },
    ...(generatedBy ? [{ label: "Prepared by", value: generatedBy }] : []),
  ].filter((f) => f.value);

  return (
    <div className="bg-[#faf6f1] border border-[#e8d4b8] rounded-lg px-3 py-2 md:px-5 md:py-3 mb-6">
      <h3 className="text-base md:text-lg font-bold text-gray-900 mb-1">{student.student_name}</h3>
      <div className="flex items-center flex-wrap text-xs text-gray-600">
        {fields.map((f, i) => (
          <span key={f.label} className="whitespace-nowrap">
            {i > 0 && <span className="mx-2 text-[#e8d4b8]">|</span>}
            <span className="font-medium text-gray-500">{f.label}:</span>{" "}
            {f.value}
          </span>
        ))}
      </div>
    </div>
  );
}
