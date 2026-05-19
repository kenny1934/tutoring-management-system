import {
  MessageSquare,
  Send,
  Inbox,
  Tag,
  Users,
  ExternalLink,
} from "lucide-react";

export default function CommsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">
          Parent communications
        </h1>
        <p className="text-sm text-ink-600 max-w-3xl">
          Reference sketch. Parent comms already exists in CSM and what primary
          asked for matches the existing shape. Included here so the IT guy can
          confirm whether to wire primary into the same module or fork it.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <FeatureCard
          icon={<Inbox className="h-5 w-5 text-accent-600" />}
          title="Inbound threads"
          body="One thread per family. Surfaces WhatsApp/SMS/email into the same view, with read/unread, who replied last, and what session it relates to."
        />
        <FeatureCard
          icon={<Send className="h-5 w-5 text-accent-600" />}
          title="Outbound templates"
          body="Pre-canned messages tutors and admin staff send most often: invoice ready, missed class, makeup arranged, term break reminder. Variables filled per student."
        />
        <FeatureCard
          icon={<Tag className="h-5 w-5 text-accent-600" />}
          title="Tags and triage"
          body="Tag a thread (e.g. fee question, schedule issue, behavioral) so it routes to the right person. Show overdue replies on the dashboard."
        />
      </div>

      <section className="surface p-5">
        <div className="flex items-start gap-3">
          <MessageSquare className="h-5 w-5 text-accent-600 mt-0.5" />
          <div className="flex-1">
            <h2 className="font-semibold text-ink-900">
              Sample thread (mock)
            </h2>
            <p className="text-sm text-ink-600 mt-1">
              Layout sketch of how a single parent thread reads. Buttons here
              are inert.
            </p>

            <div className="mt-4 surface-muted p-4 space-y-3 max-w-3xl">
              <div className="text-xs text-ink-500">
                Ms. Chan (parent of Chan Ho Yin, P6) · WhatsApp
              </div>
              <Bubble
                from="parent"
                time="Mon 9:14am"
                text="Hi, is the makeup class on Wed at 4pm or 5pm?"
              />
              <Bubble
                from="staff"
                time="Mon 10:02am"
                text="Hi Ms. Chan, the makeup is at 4pm on Wed. Ho Yin's regular Wed class is at 4pm too, so no change. We've sent the calendar update."
              />
              <Bubble
                from="parent"
                time="Mon 10:08am"
                text="Thanks!"
              />
              <div className="flex items-center justify-between pt-2 border-t border-ink-200">
                <div className="text-xs text-ink-500">
                  Tags:{" "}
                  <span className="inline-block bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 text-xs">
                    schedule
                  </span>
                </div>
                <div className="flex gap-2">
                  <button className="text-xs rounded-md border border-ink-300 px-2 py-1 text-ink-600 hover:bg-white">
                    Reply
                  </button>
                  <button className="text-xs rounded-md border border-ink-300 px-2 py-1 text-ink-600 hover:bg-white">
                    Add to template library
                  </button>
                </div>
              </div>
            </div>

            <ReferenceLink path="webapp/backend/routers/parent_communications.py" />
          </div>
        </div>
      </section>

      <section className="surface-muted p-5">
        <div className="flex items-start gap-3">
          <Users className="h-5 w-5 text-ink-600 mt-0.5" />
          <div>
            <h2 className="font-semibold text-ink-800">
              What's different for primary?
            </h2>
            <p className="text-sm text-ink-600 mt-1">
              Discovery surfaced one delta: primary parents tend to message
              about pickup logistics and behavioral notes, which secondary
              parents do less. Worth adding two extra tag presets and a
              behavioural-note template, but the page structure is unchanged.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="surface p-4">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-medium text-ink-900">{title}</h3>
      </div>
      <p className="text-sm text-ink-600 mt-2 leading-relaxed">{body}</p>
    </div>
  );
}

function Bubble({
  from,
  time,
  text,
}: {
  from: "parent" | "staff";
  time: string;
  text: string;
}) {
  const isParent = from === "parent";
  return (
    <div className={`flex ${isParent ? "" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          isParent ? "bg-white border border-ink-200" : "bg-accent-600 text-white"
        }`}
      >
        <div>{text}</div>
        <div
          className={`text-xs mt-1 ${isParent ? "text-ink-400" : "text-accent-100"}`}
        >
          {time}
        </div>
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
