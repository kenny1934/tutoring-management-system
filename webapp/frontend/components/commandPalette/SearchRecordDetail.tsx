"use client";

import useSWR from "swr";
import { useCallback, useMemo, useState } from "react";
import { useFocusTrap } from "@/lib/hooks";
import type { Student } from "@/types";
import { sessionsAPI, enrollmentsAPI, studentsAPI } from "@/lib/api";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { EnrollmentDetailPopover } from "@/components/enrollments/EnrollmentDetailPopover";
import { PreviewContent } from "./PreviewPanel";
import type { SearchCategory } from "./search-filters";
import { Modal } from "@/components/ui/modal";
import { useOverlayLayer } from "@/hooks/useOverlayLayer";

export type SearchRecord = { type: "student" | "session" | "enrollment"; id: number; source?: HTMLElement | null; position: { x: number; y: number } };

/** Open the actual record, preserving the search behind its existing popover/phone sheet. */
export function SearchRecordDetail({ record, scope, location, onClose, onNavigate, onChanged, onStudentRecords, onSession, navigate, tutorId }: {
  record: SearchRecord; tutorId?: number; scope: string; location: string; onClose: () => void; onNavigate: () => void; onChanged: () => void; onStudentRecords: (category: SearchCategory, student: { id: number; name: string }) => void; onSession: (id: number) => void; navigate: (href: string) => void;
}) {
  const { data, error, isLoading, mutate } = useSWR(["search-preview", scope, location, record.type, record.id], async () => {
    if (record.type === "student") return { type: "student" as const, data: await studentsAPI.getById(record.id) };
    if (record.type === "session") return { type: "session" as const, data: await sessionsAPI.getById(record.id) };
    return { type: "enrollment" as const, data: await enrollmentsAPI.getById(record.id) };
  }, { keepPreviousData: false, revalidateOnFocus: false });
  // EnrollmentDetailPopover predates the shared stack and accepts its layer as a prop.
  const layer = useOverlayLayer(data?.type === "enrollment" && !error);
  if (error || !data || isLoading) return <Modal isOpen onClose={onClose} title={record.type === "session" ? "Session details" : record.type === "student" ? "Student details" : "Enrolment details"}>
    {error ? <div role="alert" className="text-sm text-ink-heading">Details could not load. <button className="text-accent-ink underline" onClick={() => void mutate()}>Retry</button></div>
      : <div role="status" className="text-sm text-ink-subtle">Loading details...</div>}
  </Modal>;
  if (data.type === "student") return <StudentDetail student={data.data} onClose={onClose} tutorId={tutorId} navigate={navigate} onStudentRecords={onStudentRecords} onSession={onSession} />;
  if (data.type === "session") return <SessionDetailPopover session={data.data} isOpen onClose={onClose} clickPosition={record.position} onNavigate={onNavigate} transitionSource={record.source ?? document.getElementById(`command-result-session-${record.id}`)} />;
  return <EnrollmentDetailPopover enrollment={data.data} isOpen onClose={onClose} clickPosition={record.position} onNavigate={onNavigate} onStatusChange={onChanged} zIndex={layer.zIndex} />;
}


function StudentDetail({ student, onClose, tutorId, navigate, onStudentRecords, onSession }: {
  student: Student; onClose: () => void; tutorId?: number; navigate: (href: string) => void;
  onStudentRecords: (category: SearchCategory, student: { id: number; name: string }) => void; onSession: (id: number) => void;
}) {
  const layer = useOverlayLayer(true, { lockScroll: true });
  const [dialog, setDialog] = useState<HTMLElement | null>(null);
  const ref = useMemo(() => ({ current: dialog }), [dialog]);
  const content = useCallback((node: HTMLDivElement | null) => setDialog(node?.closest<HTMLElement>('[role="dialog"]') ?? null), []);
  useFocusTrap(layer.isTopmost, ref);
  return <Modal isOpen onClose={onClose} title="Student details" layer={layer}><div ref={content}>
    <PreviewContent data={{ type: 'student', data: student }} tutorId={tutorId} onNavigate={navigate} onStudentRecords={onStudentRecords} onSession={onSession} />
  </div></Modal>;
}
