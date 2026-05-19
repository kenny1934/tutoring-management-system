import { ParentContactsApp } from "@/components/comms/ParentContactsApp";

export default function CommsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">
          Parent communications
        </h1>
        <p className="text-sm text-ink-600 max-w-3xl">
          Record of tutor↔parent contacts. Three-panel view: students on the
          left with contact status, a calendar of all contact events in the
          middle, and a detail panel on the right. Stats and pending
          follow-ups sit at the top so nothing urgent gets buried.
        </p>
      </div>
      <ParentContactsApp />
    </div>
  );
}
