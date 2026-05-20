"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Star, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { DEMO_DAY } from "@/lib/mock-data/sessions";
import type { Session } from "@/lib/types";

/** Surfaces the performance side of "assessment" for an enrolled student —
 *  star ratings from past sessions, recent trend, tutor notes. The top-level
 *  /assessments page remains the prospect-funnel kanban. */
export function StudentAssessmentsTab() {
  const { id } = useParams<{ id: string }>();
  const { sessions } = usePrimaryStore();

  const rated = useMemo(
    () =>
      sessions
        .filter(
          (s) =>
            s.student_id === id &&
            s.session_date < DEMO_DAY &&
            typeof s.performance_rating === "number"
        )
        .sort((a, b) => b.session_date.localeCompare(a.session_date)),
    [sessions, id]
  );

  const stats = useMemo(() => {
    if (rated.length === 0) return null;
    const sum = rated.reduce(
      (acc, s) => acc + (s.performance_rating ?? 0),
      0
    );
    const avg = sum / rated.length;
    const recent = rated.slice(0, 3);
    const earlier = rated.slice(3, 6);
    const recentAvg =
      recent.reduce((a, s) => a + (s.performance_rating ?? 0), 0) /
      Math.max(recent.length, 1);
    const earlierAvg =
      earlier.length > 0
        ? earlier.reduce((a, s) => a + (s.performance_rating ?? 0), 0) /
          earlier.length
        : null;
    const trend =
      earlierAvg === null
        ? "flat"
        : recentAvg > earlierAvg + 0.2
          ? "up"
          : recentAvg < earlierAvg - 0.2
            ? "down"
            : "flat";
    return { avg, count: rated.length, trend };
  }, [rated]);

  if (rated.length === 0) {
    return (
      <div className="surface p-10 text-center text-sm text-ink-500 max-w-3xl">
        No performance ratings yet. Rate sessions on the{" "}
        <Link
          href="/sessions"
          className="text-mc-red-700 hover:underline"
        >
          Sessions page
        </Link>{" "}
        and they&apos;ll show up here.
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {stats && <StatsRow stats={stats} />}

      <section>
        <h2 className="text-sm font-semibold text-ink-900 mb-2">
          Recent ratings
        </h2>
        <div className="surface divide-y divide-ink-100 overflow-hidden">
          {rated.map((s) => (
            <RatingRow key={s.id} session={s} />
          ))}
        </div>
      </section>
    </div>
  );
}

function StatsRow({
  stats,
}: {
  stats: { avg: number; count: number; trend: "up" | "down" | "flat" };
}) {
  const TrendIcon =
    stats.trend === "up"
      ? TrendingUp
      : stats.trend === "down"
        ? TrendingDown
        : Minus;
  const trendColor =
    stats.trend === "up"
      ? "text-emerald-600"
      : stats.trend === "down"
        ? "text-rose-600"
        : "text-ink-400";
  const trendLabel =
    stats.trend === "up"
      ? "Trending up"
      : stats.trend === "down"
        ? "Trending down"
        : "Stable";

  return (
    <div className="grid sm:grid-cols-3 gap-3">
      <Stat
        label="Average rating"
        value={
          <span className="inline-flex items-center gap-1 text-mc-yellow-600">
            <Star className="h-5 w-5 fill-current" />
            <span className="text-ink-900">{stats.avg.toFixed(1)}</span>
          </span>
        }
      />
      <Stat label="Rated sessions" value={String(stats.count)} />
      <Stat
        label="Recent trend"
        value={
          <span className={`inline-flex items-center gap-1 ${trendColor}`}>
            <TrendIcon className="h-5 w-5" />
            <span className="text-ink-900 text-sm font-medium">
              {trendLabel}
            </span>
          </span>
        }
      />
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="surface p-3">
      <div className="text-xs text-ink-500">{label}</div>
      <div className="text-2xl font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function RatingRow({ session }: { session: Session }) {
  const d = new Date(`${session.session_date}T${session.start_time}:00+08:00`);
  const date = d.toLocaleDateString("en-HK", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <Link
      href={`/sessions?session=${session.id}`}
      className="block px-4 py-3 hover:bg-ink-50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="flex shrink-0">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={`h-4 w-4 ${
                n <= (session.performance_rating ?? 0)
                  ? "text-mc-yellow-500 fill-current"
                  : "text-ink-200"
              }`}
            />
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-ink-900 tabular-nums">
            {date} · {session.tutor_name}
          </div>
          {session.notes && (
            <div className="text-xs text-ink-600 mt-0.5 italic line-clamp-2">
              &ldquo;{session.notes}&rdquo;
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
