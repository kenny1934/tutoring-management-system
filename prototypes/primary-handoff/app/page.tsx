import Link from "next/link";

const modules = [
  {
    href: "/checktables",
    label: "Checktables",
    blurb:
      "Per-textbook exercise grid. Tutor picks items per student, accumulates a print batch, assigns into the student's session record.",
    status: "New module",
    priority: "High",
  },
  {
    href: "/assessments",
    label: "Assessment booking & follow-up",
    blurb:
      "Kanban over the assessment lifecycle (booked → attended → follow-up → enrolled or lost). Sibling to the existing Trial flow.",
    status: "New module (Trial-shaped)",
    priority: "Medium",
  },
  {
    href: "/sessions",
    label: "Sessions, reschedule, makeup",
    blurb:
      "Already in CSM as the schedule + makeup modal. Light reference so the team can see the shape and confirm parity.",
    status: "Reference only",
    priority: "Low",
  },
  {
    href: "/comms",
    label: "Parent communications",
    blurb:
      "Already in CSM. Layout sketch only, so the team can confirm primary needs the same shape and doesn't want a different cut.",
    status: "Reference only",
    priority: "Low",
  },
];

export default function Home() {
  return (
    <div className="space-y-6">
      <section className="surface p-6">
        <h1 className="text-xl font-semibold text-ink-900">
          Primary Section Handoff Prototypes
        </h1>
        <p className="mt-2 text-sm text-ink-600 max-w-3xl leading-relaxed">
          These prototypes communicate what the primary section asked for in
          the discovery meeting. They are not production. They run on mock
          data, have no backend, and use a neutral theme on purpose so the
          intent is separable from any particular brand or stack.
        </p>
        <p className="mt-2 text-sm text-ink-600 max-w-3xl leading-relaxed">
          Each page below is a self-contained sketch. The two priorities are
          Checktables (genuinely new) and Assessments (a Trial-shaped sibling).
          The other two pages already exist in CSM in a form that primary can
          use as-is or with light adjustment; they are included here so whoever
          picks up the build sees the full scope.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {modules.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="surface p-5 hover:border-ink-400 transition-colors group block"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-ink-900 group-hover:text-accent-600 transition-colors">
                {m.label}
              </h2>
              <span
                className="text-xs rounded-md px-2 py-1 bg-ink-100 text-ink-600 whitespace-nowrap"
                data-priority={m.priority}
              >
                {m.priority}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-600 leading-relaxed">{m.blurb}</p>
            <p className="mt-3 text-xs text-ink-400">{m.status}</p>
          </Link>
        ))}
      </section>

      <section className="surface-muted p-5 text-sm text-ink-600">
        <p className="font-medium text-ink-800">Notes for the reader</p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>
            All data is fake. Student names, exercise codes, and timestamps
            are seeded for demo purposes.
          </li>
          <li>
            The Waitlist module discussed in the meeting is not in this set,
            because the features primary asked for already exist in CSM's
            waitlist (multi-time preference, vacancy suggestions, mixed
            prospects + slot change).
          </li>
          <li>
            For the list of HQ API endpoints each module would need to talk
            to once productionised, see <code className="text-xs">
              hq-api-needs-for-primary.md
            </code>{" "}
            sitting next to this app's repo notes.
          </li>
        </ul>
      </section>
    </div>
  );
}
