import {
  Calendar,
  Clock,
  RotateCw,
  Sparkles,
  Users,
  ExternalLink,
} from "lucide-react";

export default function SessionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">
          Sessions, reschedule, makeup
        </h1>
        <p className="text-sm text-ink-600 max-w-3xl">
          This page is a reference sketch. The functionality below already
          exists in CSM. Included here so primary can confirm parity or call
          out specific differences they need.
        </p>
      </div>

      <section className="surface p-5">
        <div className="flex items-start gap-3">
          <Calendar className="h-5 w-5 text-accent-600 mt-0.5" />
          <div>
            <h2 className="font-semibold text-ink-900">Session management</h2>
            <p className="text-sm text-ink-600 mt-1">
              Per-class session list with attendance, lesson mode (in-person /
              online / makeup), classwork and homework records, performance
              rating, and tutor notes. Lives at the class level so a tutor can
              see one row per student per session.
            </p>
            <ul className="mt-3 text-sm text-ink-600 list-disc pl-5 space-y-1">
              <li>Mark present, absent, late, makeup</li>
              <li>
                Record CW and HW per student, including which checktable items
                were assigned this session
              </li>
              <li>Carry performance rating across sessions for trend view</li>
            </ul>
            <ReferenceLink path="webapp/frontend/app/sessions/" />
          </div>
        </div>
      </section>

      <section className="surface p-5">
        <div className="flex items-start gap-3">
          <RotateCw className="h-5 w-5 text-accent-600 mt-0.5" />
          <div>
            <h2 className="font-semibold text-ink-900">Reschedule</h2>
            <p className="text-sm text-ink-600 mt-1">
              Tutor or admin reschedules an individual session out of its
              regular slot. Tracks original slot, new slot, reason, and links
              to a makeup record when applicable.
            </p>
            <ul className="mt-3 text-sm text-ink-600 list-disc pl-5 space-y-1">
              <li>Single-session reschedule (one student, one date)</li>
              <li>
                Class-wide reschedule (whole class moves, e.g. for typhoon)
              </li>
              <li>Optional auto-credit if the student is owed a makeup</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="surface p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-accent-600 mt-0.5" />
          <div>
            <h2 className="font-semibold text-ink-900">
              Makeup smart suggestions
            </h2>
            <p className="text-sm text-ink-600 mt-1">
              When scheduling a makeup, the system suggests slots that fit the
              student's other commitments, available tutor pairings, and class
              capacity. Already exists in CSM's schedule makeup modal; for
              primary this would carry over unchanged with potentially
              different capacity rules.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <SuggestionCard
                day="Wed 22 May"
                time="4:00pm"
                fit="Best fit"
                tone="emerald"
                rationale="Same tutor, class has 2 free seats"
              />
              <SuggestionCard
                day="Fri 24 May"
                time="5:30pm"
                fit="Good fit"
                tone="amber"
                rationale="Different tutor, same level"
              />
              <SuggestionCard
                day="Sat 25 May"
                time="11:00am"
                fit="Stretch"
                tone="rose"
                rationale="Outside the student's usual window"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="surface-muted p-5">
        <div className="flex items-start gap-3">
          <Users className="h-5 w-5 text-ink-600 mt-0.5" />
          <div>
            <h2 className="font-semibold text-ink-800">What's different for primary?</h2>
            <p className="text-sm text-ink-600 mt-1">
              The session row, reschedule flow, and makeup suggester carry
              over directly. The only primary-specific consideration raised in
              discovery was pickup logistics, which is currently not modelled
              and would be a small addition (e.g. a note field per session, or
              a separate pickup-status pill).
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function SuggestionCard({
  day,
  time,
  fit,
  tone,
  rationale,
}: {
  day: string;
  time: string;
  fit: string;
  tone: "emerald" | "amber" | "rose";
  rationale: string;
}) {
  const toneClass = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
  }[tone];
  return (
    <div className="rounded-md border border-ink-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-ink-900">
          {day} · {time}
        </div>
        <span
          className={`text-xs rounded-md px-1.5 py-0.5 border ${toneClass}`}
        >
          {fit}
        </span>
      </div>
      <div className="text-xs text-ink-500 mt-1 flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {rationale}
      </div>
    </div>
  );
}

function ReferenceLink({ path }: { path: string }) {
  return (
    <div className="mt-3 text-xs text-ink-500 flex items-center gap-1.5">
      <ExternalLink className="h-3 w-3" />
      Existing in CSM: <code className="font-mono">{path}</code>
    </div>
  );
}
