import { ParentContactsApp } from "@/components/comms/ParentContactsApp";

export default function CommsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">
          Parent communications
        </h1>
        <p className="text-sm text-ink-600 max-w-3xl">
          A log of every contact with parents. Pick a student to see their
          contact status, browse the calendar of contact events, and open any
          entry for detail. Pending follow-ups stay pinned at the top.
        </p>
      </div>
      <ParentContactsApp />
    </div>
  );
}
