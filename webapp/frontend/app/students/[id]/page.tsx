"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Student, Enrollment } from "@/types";
import { ArrowLeft, User, GraduationCap, MapPin, Phone, Mail, BookOpen } from "lucide-react";

export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = parseInt(params.id as string);

  const [student, setStudent] = useState<Student | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "enrollments">("info");

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
      <div className="flex flex-col gap-6 p-8">
        <div className="h-9 w-48 bg-muted rounded animate-pulse" />
        <Card>
          <CardContent className="p-6">
            <div className="h-32 bg-muted rounded animate-pulse" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-destructive">Error: {error || "Student not found"}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{student.student_name}</h1>
          <p className="text-muted-foreground">
            Student ID: {student.school_student_id || "N/A"}
          </p>
        </div>
        <Badge variant={enrollments.length > 0 ? "success" : "secondary"}>
          {enrollments.length} enrollment{enrollments.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab("info")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "info"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Basic Information
        </button>
        <button
          onClick={() => setActiveTab("enrollments")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "enrollments"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Enrollments ({enrollments.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "info" && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Full Name</p>
                <p className="font-medium">{student.student_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Student ID</p>
                <p className="font-mono text-sm">{student.school_student_id || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-mono text-sm">{student.phone || "N/A"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                Academic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Grade</p>
                <Badge variant="outline">{student.grade || "N/A"}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">School</p>
                <p className="font-medium">{student.school || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Language Stream</p>
                <p className="font-medium">{student.lang_stream || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Academic Stream</p>
                <p className="font-medium">{student.academic_stream || "N/A"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Location
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <p className="text-sm text-muted-foreground">Home Location</p>
                <p className="font-medium">{student.home_location || "N/A"}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "enrollments" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              All Enrollments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {enrollments.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                No enrollments found for this student
              </p>
            ) : (
              <div className="space-y-4">
                {enrollments.map((enrollment) => (
                  <div
                    key={enrollment.id}
                    className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <p className="font-medium">
                          {enrollment.assigned_day && enrollment.assigned_time
                            ? `${enrollment.assigned_day} ${enrollment.assigned_time}`
                            : "Schedule TBD"
                          }
                        </p>
                        {enrollment.first_lesson_date && (
                          <p className="text-sm text-muted-foreground">
                            First lesson: {new Date(enrollment.first_lesson_date).toLocaleDateString()}
                          </p>
                        )}
                        {enrollment.location && (
                          <p className="text-sm text-muted-foreground">
                            Location: {enrollment.location}
                          </p>
                        )}
                        {enrollment.lessons_paid && (
                          <p className="text-sm text-muted-foreground">
                            Lessons paid: {enrollment.lessons_paid}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge
                          variant={
                            enrollment.payment_status === "Paid"
                              ? "success"
                              : enrollment.payment_status === "Pending Payment"
                              ? "warning"
                              : "secondary"
                          }
                        >
                          {enrollment.payment_status}
                        </Badge>
                        {enrollment.enrollment_type && (
                          <Badge variant="outline">{enrollment.enrollment_type}</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
