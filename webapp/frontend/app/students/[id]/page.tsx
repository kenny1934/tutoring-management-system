"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Student, Enrollment } from "@/types";
import { ArrowLeft, User, GraduationCap, MapPin, Phone, Mail, BookOpen, Calendar, DollarSign } from "lucide-react";
import { PageTransition, FileFolder, RubberStamp } from "@/lib/design-system";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = parseInt(params.id as string);

  const [student, setStudent] = useState<Student | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [studentData, enrollmentData] = await Promise.all([
          api.students.getById(studentId),
          api.enrollments.getAll(studentId),
        ]);
        setStudent(studentData);
        setEnrollments(enrollmentData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load student");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [studentId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF8DC] dark:bg-[#1a1a1a]">
        <PageTransition className="flex flex-col gap-6 p-4 sm:p-8">
          <div className="h-16 bg-[#e6d5b8] dark:bg-[#3d3a32] rounded animate-pulse" />
          <div className="h-96 bg-[#e6d5b8] dark:bg-[#3d3a32] rounded animate-pulse" />
        </PageTransition>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="min-h-screen bg-[#FFF8DC] dark:bg-[#1a1a1a] flex items-center justify-center p-8">
        <div className="bg-red-50 dark:bg-red-950/20 border-2 border-red-500 rounded-lg p-6 text-center">
          <p className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Error</p>
          <p className="text-sm text-gray-900 dark:text-gray-100">
            {error || "Student not found"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF8DC] dark:bg-[#1a1a1a]">
      <PageTransition className="flex flex-col gap-6 p-4 sm:p-8">
        {/* Header with Back Button and Manila Folder Tab */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-4"
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="hover:bg-[#E6D5B8] dark:hover:bg-[#3d3a32]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          {/* Manila Folder Tab Header */}
          <div className="flex-1 relative">
            <div
              className="relative bg-[#e6d5b8] dark:bg-[#3d3a32] rounded-t-lg px-6 py-4 border-2 border-b-0 border-amber-900/40 dark:border-amber-900/20"
              style={{
                clipPath: "polygon(0 30%, 2% 0%, 25% 0%, 27% 30%, 100% 30%, 100% 100%, 0 100%)",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="ml-[27%]">
                  <h1
                    className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-foreground"
                    style={{ fontFamily: "Georgia, serif" }}
                  >
                    {student.student_name}
                  </h1>
                  <p className="text-sm font-mono text-gray-600 dark:text-gray-400 mt-1">
                    Student ID: {student.school_student_id || "N/A"}
                  </p>
                </div>

                {/* Confidential Stamp */}
                <motion.div
                  initial={{ scale: 0, rotate: -15 }}
                  animate={{ scale: 1, rotate: -12 }}
                  transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                  className="hidden sm:block"
                >
                  <div
                    className="px-4 py-2 border-4 border-red-600 dark:border-red-500 rounded text-red-600 dark:text-red-500 font-bold text-lg uppercase tracking-wider"
                    style={{
                      fontFamily: "Arial, sans-serif",
                      transform: "rotate(-12deg)",
                      opacity: 0.6,
                    }}
                  >
                    Student Record
                  </div>
                </motion.div>
              </div>

              {/* Type-written label on tab */}
              <div
                className="absolute top-2 left-[3%] w-[22%] text-center"
                style={{ fontFamily: "Courier, monospace" }}
              >
                <div className="text-xs font-bold text-gray-700 dark:text-gray-300 bg-white dark:bg-[#2d2618] px-2 py-1 rounded border border-gray-400 dark:border-gray-600">
                  {student.grade || "N/A"}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* File Folder with Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <FileFolder
            tabs={[
              {
                label: "Personal Info",
                color: "yellow",
                content: (
                  <div className="space-y-6">
                    {/* Personal Information Form */}
                    <div className="bg-white dark:bg-[#2d2618] rounded border-2 border-gray-300 dark:border-gray-600 p-6">
                      <div className="flex items-center gap-2 mb-4 pb-2 border-b-2 border-gray-400 dark:border-gray-600">
                        <User className="h-5 w-5 text-[#1e3a5f] dark:text-[#7a9fd5]" />
                        <h3
                          className="text-lg font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide"
                          style={{ fontFamily: "Arial, sans-serif" }}
                        >
                          Personal Information
                        </h3>
                      </div>

                      <div className="space-y-4">
                        <FormField label="Full Name" value={student.student_name} />
                        <FormField label="Student ID" value={student.school_student_id || "N/A"} mono />
                        <FormField label="Phone Number" value={student.phone || "N/A"} mono />
                      </div>
                    </div>

                    {/* Location Information */}
                    <div className="bg-white dark:bg-[#2d2618] rounded border-2 border-gray-300 dark:border-gray-600 p-6">
                      <div className="flex items-center gap-2 mb-4 pb-2 border-b-2 border-gray-400 dark:border-gray-600">
                        <MapPin className="h-5 w-5 text-[#1e3a5f] dark:text-[#7a9fd5]" />
                        <h3
                          className="text-lg font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide"
                          style={{ fontFamily: "Arial, sans-serif" }}
                        >
                          Location
                        </h3>
                      </div>

                      <FormField label="Home Location" value={student.home_location || "N/A"} />
                    </div>
                  </div>
                ),
              },
              {
                label: "Academic",
                color: "blue",
                content: (
                  <div className="space-y-6">
                    {/* Academic Information Form */}
                    <div className="bg-white dark:bg-[#2d2618] rounded border-2 border-gray-300 dark:border-gray-600 p-6">
                      <div className="flex items-center gap-2 mb-4 pb-2 border-b-2 border-gray-400 dark:border-gray-600">
                        <GraduationCap className="h-5 w-5 text-[#1e3a5f] dark:text-[#7a9fd5]" />
                        <h3
                          className="text-lg font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide"
                          style={{ fontFamily: "Arial, sans-serif" }}
                        >
                          Academic Information
                        </h3>
                      </div>

                      <div className="space-y-4">
                        <FormField label="Current Grade" value={student.grade || "N/A"} badge />
                        <FormField label="School" value={student.school || "N/A"} />
                        <FormField label="Language Stream" value={student.lang_stream || "N/A"} />
                        <FormField label="Academic Stream" value={student.academic_stream || "N/A"} />
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                label: "Enrollments",
                color: "green",
                content: (
                  <div className="space-y-4">
                    {/* Enrollment Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-[#1e3a5f] dark:text-[#7a9fd5]" />
                        <h3
                          className="text-lg font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide"
                          style={{ fontFamily: "Arial, sans-serif" }}
                        >
                          Active Enrollments
                        </h3>
                      </div>
                      <Badge variant="secondary" className="bg-[#2d5016] dark:bg-[#3d7018] text-white border-2 border-[#1f3610]">
                        {enrollments.length} enrollment{enrollments.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>

                    {enrollments.length === 0 ? (
                      <div className="bg-white dark:bg-[#2d2618] rounded border-2 border-gray-300 dark:border-gray-600 p-8 text-center">
                        <BookOpen className="h-12 w-12 mx-auto mb-4 text-gray-400 dark:text-gray-600" />
                        <p className="text-gray-600 dark:text-gray-400">
                          No enrollments found for this student
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {enrollments.map((enrollment, index) => (
                          <motion.div
                            key={enrollment.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1, duration: 0.3 }}
                            className="relative bg-white dark:bg-[#2d2618] rounded border-2 border-gray-300 dark:border-gray-600 p-5 hover:border-[#2c5aa0] dark:hover:border-[#5a7fb5] transition-all duration-200"
                          >
                            {/* Class Schedule Card Style */}
                            <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                              <div className="flex-1 space-y-3">
                                {/* Schedule */}
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-4 w-4 text-[#1e3a5f] dark:text-[#7a9fd5]" />
                                  <span className="font-bold text-gray-900 dark:text-gray-100">
                                    {enrollment.assigned_day && enrollment.assigned_time
                                      ? `${enrollment.assigned_day} ${enrollment.assigned_time}`
                                      : "Schedule TBD"}
                                  </span>
                                </div>

                                {/* First Lesson */}
                                {enrollment.first_lesson_date && (
                                  <div className="text-sm text-gray-600 dark:text-gray-400">
                                    <span className="font-medium">First lesson:</span>{" "}
                                    {new Date(enrollment.first_lesson_date).toLocaleDateString()}
                                  </div>
                                )}

                                {/* Location */}
                                {enrollment.location && (
                                  <div className="text-sm text-gray-600 dark:text-gray-400">
                                    <span className="font-medium">Location:</span> {enrollment.location}
                                  </div>
                                )}

                                {/* Lessons Paid */}
                                {enrollment.lessons_paid && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <DollarSign className="h-4 w-4 text-green-600 dark:text-green-500" />
                                    <span className="text-gray-600 dark:text-gray-400">
                                      <span className="font-medium">Lessons paid:</span> {enrollment.lessons_paid}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Status Stamps */}
                              <div className="flex flex-col items-end gap-2">
                                {/* Payment Status Stamp */}
                                {enrollment.payment_status && (
                                  <div
                                    className={cn(
                                      "px-3 py-1 border-3 rounded font-bold text-xs uppercase tracking-wider",
                                      enrollment.payment_status === "Paid"
                                        ? "border-green-600 text-green-600 dark:border-green-500 dark:text-green-500"
                                        : enrollment.payment_status === "Pending Payment"
                                        ? "border-yellow-600 text-yellow-600 dark:border-yellow-500 dark:text-yellow-500"
                                        : "border-gray-600 text-gray-600 dark:border-gray-500 dark:text-gray-500"
                                    )}
                                    style={{
                                      transform: "rotate(-3deg)",
                                      opacity: 0.8,
                                    }}
                                  >
                                    {enrollment.payment_status}
                                  </div>
                                )}

                                {/* Enrollment Type Badge */}
                                {enrollment.enrollment_type && (
                                  <Badge
                                    variant="outline"
                                    className="border-[#1e3a5f] text-[#1e3a5f] dark:border-[#4a6fa5] dark:text-[#7a9fd5]"
                                  >
                                    {enrollment.enrollment_type}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Hole punches for binder */}
                            <div className="absolute left-2 top-0 bottom-0 flex flex-col justify-around py-4">
                              {[1, 2, 3].map((i) => (
                                <div
                                  key={i}
                                  className="w-3 h-3 rounded-full bg-gray-300 dark:bg-gray-600 border border-gray-400 dark:border-gray-500"
                                />
                              ))}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                ),
              },
            ]}
            defaultTab={0}
            tabPosition="top"
          />
        </motion.div>
      </PageTransition>
    </div>
  );
}

// Helper component for form fields
interface FormFieldProps {
  label: string;
  value: string;
  mono?: boolean;
  badge?: boolean;
}

function FormField({ label, value, mono = false, badge = false }: FormFieldProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-2 border-b border-gray-200 dark:border-gray-700">
      <div
        className="sm:w-1/3 font-bold text-sm text-gray-700 dark:text-gray-300 uppercase tracking-wide"
        style={{ fontFamily: "Arial, sans-serif" }}
      >
        {label}:
      </div>
      <div className="sm:w-2/3">
        {badge ? (
          <Badge
            variant="outline"
            className="border-[#1e3a5f] text-[#1e3a5f] dark:border-[#4a6fa5] dark:text-[#7a9fd5] font-bold"
          >
            {value}
          </Badge>
        ) : (
          <span
            className={cn(
              "text-gray-900 dark:text-gray-100",
              mono && "font-mono text-sm"
            )}
            style={!mono ? { fontFamily: "Georgia, serif" } : undefined}
          >
            {value}
          </span>
        )}
      </div>
    </div>
  );
}
