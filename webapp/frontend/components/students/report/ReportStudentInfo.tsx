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
    { label: "Stream", value: student.lang_stream },
    ...(generatedBy ? [{ label: "Prepared by", value: generatedBy }] : []),
  ].filter((f) => f.value);

  return (
    <div className="bg-[#faf6f1] border border-[#e8d4b8] rounded-lg px-5 py-3 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-bold text-gray-900">{student.student_name}</h3>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          {fields.map((f) => (
            <span key={f.label}>
              <span className="font-medium text-gray-500">{f.label}:</span>{" "}
              {f.value}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
