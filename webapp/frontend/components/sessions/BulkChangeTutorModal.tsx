"use client";

import { useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Select } from "@/components/controls";
import { TutorOptions } from "@/components/selectors/TutorOptions";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useActiveTutors } from "@/lib/hooks";
import { worksAt } from "@/lib/employment";
import { ApiError, sessionsAPI } from "@/lib/api";
import { revalidateSessionCaches } from "@/lib/session-cache";
import { mutate } from "swr";
import type { Session } from "@/types";

interface Props {
  sessions: Session[];
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function BulkChangeTutorModal({ sessions, isOpen, onClose, onSaved }: Props) {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const { data: tutors = [], isLoading } = useActiveTutors();
  // Keep the reviewed batch stable if a background refresh changes the page.
  const [selection] = useState(() => [...sessions]);
  const [tutorId, setTutorId] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ session_id: number; message: string }[]>([]);
  const options = useMemo(() => tutors.filter(tutor => selection.every(session =>
    session.tutor_id === tutor.id || (
      worksAt(tutor, session.location, session.session_date) &&
      (!tutor.departure_effective_on || session.session_date <= tutor.departure_effective_on)
    )
  )).sort((a, b) => a.tutor_name.localeCompare(b.tutor_name)), [tutors, selection]);
  const target = options.find(tutor => tutor.id === Number(tutorId));
  const changeCount = target ? selection.filter(session => session.tutor_id !== target.id).length : 0;
  const locations = new Set(selection.map(session => session.location));

  async function save() {
    if (!isAdmin || !target || !changeCount || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setIssues([]);
    try {
      const result = await sessionsAPI.bulkChangeTutor(selection.map(session => session.id), target.id);
      // Re-fetch lists because tutor filters and departure views can gain or
      // lose rows. Replacing rows in place would leave the old membership.
      revalidateSessionCaches();
      for (const id of result.changed_session_ids) void mutate(["session", id]);
      void mutate(key => key === "employment-overrun" || (Array.isArray(key) && [
        "unchecked-attendance", "unchecked-attendance-count", "dashboard-stats", "activity-feed", "departure-load",
      ].includes(key[0])));
      showToast(`Tutor changed for ${result.changed_session_ids.length} session${result.changed_session_ids.length === 1 ? "" : "s"}.`, "success");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change the tutor. Try again.");
      if (err instanceof ApiError && err.detail && typeof err.detail === "object" && "issues" in err.detail) {
        setIssues((err.detail as { issues: { session_id: number; message: string }[] }).issues);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!isAdmin) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Change tutor" size="lg" persistent={saving}
      footer={<>
        <Button variant="quiet" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving || !target || changeCount === 0}>
          {saving ? "Changing tutor..." : `Change tutor for ${changeCount} session${changeCount === 1 ? "" : "s"}`}
        </Button>
      </>}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Choose a tutor for the selected sessions. Their dates, times and other lesson details will stay the same.
        </p>
        <Field label="New tutor" id="bulk-session-tutor">
          <Select id="bulk-session-tutor" value={tutorId} disabled={saving || isLoading}
            onChange={event => { setTutorId(event.target.value); setError(null); setIssues([]); }}>
            <option value="">{isLoading ? "Loading tutors..." : "Select a tutor"}</option>
            <TutorOptions tutors={options} location={locations.size === 1 ? selection[0]?.location : undefined} />
          </Select>
        </Field>
        {!isLoading && options.length === 0 && <p className="text-sm text-muted-foreground">
          No tutor is available for every selected date and branch. Select a smaller group of sessions.
        </p>}
        {target && <p className="text-sm">
          {changeCount} session{changeCount === 1 ? "" : "s"} will be assigned to {target.tutor_name}.
          {selection.length > changeCount && ` ${selection.length - changeCount} already assigned to this tutor will stay unchanged.`}
        </p>}
        {error && <div role="alert" className="text-sm text-red-700 dark:text-red-400">
          <p>{error}</p>
          {issues.length > 0 && <ul className="mt-2 list-disc pl-5">
            {issues.map(issue => {
              const session = selection.find(item => item.id === issue.session_id);
              return <li key={issue.session_id}>{session?.student_name || `Session ${issue.session_id}`} ({session?.session_date}): {issue.message}</li>;
            })}
          </ul>}
        </div>}
        <div className="max-h-64 overflow-auto rounded border border-line">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-line">
              <th className="p-2">Student</th><th className="p-2">Session</th><th className="p-2">Current tutor</th>
            </tr></thead>
            <tbody>{selection.map(session => <tr key={session.id} className="border-b border-line last:border-0">
              <td className="p-2">{session.student_name}</td>
              <td className="p-2">{session.session_date}<br />{session.time_slot}<br />{session.location}</td>
              <td className="p-2">{session.tutor_name}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
