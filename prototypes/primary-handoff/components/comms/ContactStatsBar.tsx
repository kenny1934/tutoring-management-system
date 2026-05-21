"use client";

import { Phone, AlertCircle, MessageCircle, Clock } from "lucide-react";

type Props = {
  total: number;
  thisWeek: number;
  pendingFollowups: number;
  needingContact: number;
};

export function ContactStatsBar({
  total,
  thisWeek,
  pendingFollowups,
  needingContact,
}: Props) {
  return (
    <div className="surface p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat
        icon={<MessageCircle className="h-4 w-4 text-mc-red-600" />}
        label="Total contacts"
        value={total}
      />
      <Stat
        icon={<Phone className="h-4 w-4 text-emerald-600" />}
        label="This week"
        value={thisWeek}
      />
      <Stat
        icon={<Clock className="h-4 w-4 text-amber-600" />}
        label="Pending follow-ups"
        value={pendingFollowups}
        tone={pendingFollowups > 0 ? "warn" : undefined}
      />
      <Stat
        icon={<AlertCircle className="h-4 w-4 text-rose-600" />}
        label="Students needing contact"
        value={needingContact}
        tone={needingContact > 0 ? "bad" : undefined}
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "warn" | "bad";
}) {
  const valueCls =
    tone === "warn"
      ? "text-amber-700"
      : tone === "bad"
        ? "text-rose-700"
        : "text-ink-900";
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-md bg-ink-100 p-2">{icon}</div>
      <div>
        <div className={`text-xl font-semibold leading-none ${valueCls}`}>
          {value}
        </div>
        <div className="text-xs text-ink-500 mt-1">{label}</div>
      </div>
    </div>
  );
}
