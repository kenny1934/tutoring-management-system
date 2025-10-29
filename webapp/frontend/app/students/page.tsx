"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useLocation } from "@/contexts/LocationContext";
import type { Student } from "@/types";
import { Search, Filter, User } from "lucide-react";
import { PageTransition, GradeBookHeader, StudentCard } from "@/lib/design-system";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export default function StudentsPage() {
  const router = useRouter();
  const { selectedLocation } = useLocation();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [flippingCardId, setFlippingCardId] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    async function fetchStudents() {
      try {
        setLoading(true);
        const data = await api.students.getAll({
          search: searchTerm || undefined,
          grade: gradeFilter || undefined,
          location: selectedLocation !== "All Locations" ? selectedLocation : undefined,
          limit: 100,
        });
        setStudents(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load students");
      } finally {
        setLoading(false);
      }
    }

    fetchStudents();
  }, [searchTerm, gradeFilter, selectedLocation]);

  // Handle card click with flip animation
  const handleCardClick = (studentId: number) => {
    setFlippingCardId(studentId);
    setTimeout(() => {
      router.push(`/students/${studentId}`);
    }, 400);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF8DC] dark:bg-[#1a1a1a]">
        <PageTransition className="flex flex-col gap-6 p-4 sm:p-8">
          {/* Header Skeleton */}
          <div className={cn(
            "h-32 bg-gradient-to-br from-[#8B1538] to-[#4a0b1a] rounded-lg animate-pulse border-4 border-[#6d1028]"
          )} />

          {/* Filters Skeleton */}
          <div className={cn(
            "h-24 bg-white dark:bg-[#2d2618] rounded-lg animate-pulse border-2 border-[#1e3a5f]/30"
          )} />

          {/* Cards Skeleton */}
          <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-48 bg-[#FFF8DC] dark:bg-[#2d2618] rounded-lg animate-pulse border-2 border-[#1e3a5f]/30"
              />
            ))}
          </div>
        </PageTransition>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FFF8DC] dark:bg-[#1a1a1a] flex items-center justify-center p-8">
        <div className="bg-red-50 dark:bg-red-950/20 border-2 border-red-500 rounded-lg p-6 text-center">
          <p className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Error</p>
          <p className="text-sm text-gray-900 dark:text-gray-100">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF8DC] dark:bg-[#1a1a1a]">
      <PageTransition className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-8">
        {/* Grade Book Header */}
        <GradeBookHeader
          title="Student Registry"
          subtitle="Complete Student Directory"
          theme="burgundy"
          rightContent={
            <div className="bg-[#2d5016] dark:bg-[#3d7018] text-white px-4 py-2 rounded-full border-2 border-[#1f3610] font-bold shadow-lg">
              {students.length} student{students.length !== 1 ? "s" : ""}
            </div>
          }
        />

        {/* Search and Filters - Grade Book Toolbar Style */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className={cn(
            "relative bg-white dark:bg-[#2d2618] border-2 border-[#1e3a5f] dark:border-[#4a6fa5] rounded-lg p-4 sm:p-6",
            "shadow-md"
          )}
          style={{
            background: "linear-gradient(to bottom, #ffffff 0%, #f8f8f8 100%)",
          }}
        >
          {/* Ruler markings at top */}
          <div className="absolute top-0 left-4 right-4 h-3 flex items-start justify-around">
            {Array.from({ length: 40 }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "bg-gray-400 dark:bg-gray-600",
                  i % 5 === 0 ? "w-px h-3" : "w-px h-2"
                )}
              />
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            {/* Search Input */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Search className="h-4 w-4 text-[#1e3a5f] dark:text-[#7a9fd5]" />
                <label className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                  Search Students
                </label>
              </div>
              <input
                type="text"
                placeholder="Search by name or student ID..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full px-4 py-2 bg-[#FFF8DC] dark:bg-[#1a1a1a] border-2 border-[#1e3a5f]/30 dark:border-[#4a6fa5]/30 rounded focus:outline-none focus:ring-2 focus:ring-[#2c5aa0] dark:focus:ring-[#5a7fb5] text-gray-900 dark:text-gray-100 font-medium transition-all duration-200 hover:border-[#2c5aa0] dark:hover:border-[#5a7fb5]"
                style={{
                  fontFamily: "Georgia, serif",
                }}
              />
            </div>

            {/* Grade Filter */}
            <div className="flex-1 sm:max-w-xs">
              <div className="flex items-center gap-2 mb-2">
                <Filter className="h-4 w-4 text-[#1e3a5f] dark:text-[#7a9fd5]" />
                <label className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                  Filter by Grade
                </label>
              </div>
              <select
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                className="w-full px-4 py-2 bg-[#FFF8DC] dark:bg-[#1a1a1a] border-2 border-[#1e3a5f]/30 dark:border-[#4a6fa5]/30 rounded focus:outline-none focus:ring-2 focus:ring-[#2c5aa0] dark:focus:ring-[#5a7fb5] text-gray-900 dark:text-gray-100 font-medium appearance-none cursor-pointer transition-all duration-200 hover:border-[#2c5aa0] dark:hover:border-[#5a7fb5]"
                style={{
                  fontFamily: "Georgia, serif",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%231e3a5f' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 1rem center',
                }}
              >
                <option value="">All Grades</option>
                <option value="S1">S1</option>
                <option value="S2">S2</option>
                <option value="S3">S3</option>
                <option value="S4">S4</option>
                <option value="S5">S5</option>
                <option value="S6">S6</option>
              </select>
            </div>
          </div>
        </motion.div>

        {/* Student Cards Grid */}
        {students.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="flex justify-center py-12"
          >
            <div className="bg-[#FFF8DC] dark:bg-[#2d2618] border-2 border-[#1e3a5f] rounded-lg p-8 text-center shadow-md">
              <User className="h-12 w-12 mx-auto mb-4 text-gray-700 dark:text-gray-300" />
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                No students found
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Try adjusting your search or filters
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          >
            {students.map((student, index) => (
              <motion.div
                key={student.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.5 + index * 0.05,
                  duration: 0.3,
                }}
              >
                <StudentCard
                  studentName={student.student_name}
                  studentId={student.school_student_id || undefined}
                  grade={student.grade || undefined}
                  school={student.school || undefined}
                  location={student.home_location || undefined}
                  enrollmentCount={student.enrollment_count || 0}
                  onClick={() => handleCardClick(student.id)}
                  isFlipping={flippingCardId === student.id}
                />
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Summary Statistics - Report Card Style */}
        {students.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.6 + students.length * 0.05,
              duration: 0.5,
            }}
            className={cn(
              "relative bg-gradient-to-br from-[#FFF8DC] to-[#FFEFD5] border-4 border-[#1e3a5f] dark:border-[#4a6fa5] rounded-lg p-6 shadow-lg"
            )}
          >
            {/* Decorative top border */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[#D4AF37] via-[#FFD700] to-[#D4AF37]" />

            {/* Header */}
            <div className="mb-6 text-center">
              <h3
                className="text-xl font-bold text-[#1e3a5f] dark:text-[#7a9fd5]"
                style={{ fontFamily: "Georgia, serif" }}
              >
                Registry Summary
              </h3>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border-2 border-[#1e3a5f]/30 dark:border-[#4a6fa5]/30 text-center">
                <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Total Students
                </p>
                <p className="text-3xl font-bold text-[#1e3a5f] dark:text-[#7a9fd5]">
                  {students.length}
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border-2 border-[#1e3a5f]/30 dark:border-[#4a6fa5]/30 text-center">
                <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Active Enrollments
                </p>
                <p className="text-3xl font-bold text-[#2d5016] dark:text-[#6d9d3f]">
                  {students.reduce((sum, s) => sum + (s.enrollment_count || 0), 0)}
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border-2 border-[#1e3a5f]/30 dark:border-[#4a6fa5]/30 text-center">
                <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Avg per Student
                </p>
                <p className="text-3xl font-bold text-[#8B1538] dark:text-[#c41e3a]">
                  {(students.reduce((sum, s) => sum + (s.enrollment_count || 0), 0) / students.length).toFixed(1)}
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border-2 border-[#1e3a5f]/30 dark:border-[#4a6fa5]/30 text-center">
                <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Unique Grades
                </p>
                <p className="text-3xl font-bold text-[#1e3a5f] dark:text-[#7a9fd5]">
                  {new Set(students.map(s => s.grade).filter(Boolean)).size}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </PageTransition>
    </div>
  );
}
