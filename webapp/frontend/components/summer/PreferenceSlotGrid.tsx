import { useEffect, useState } from "react";
import { dayLabel, type Lang, t } from "@/lib/summer-utils";

export interface PreferenceSlot {
  day: string;
  time: string;
}

interface PreferenceSlotGridProps {
  openDays: string[];
  slotsByDay: Record<string, string[]>;
  /** Currently selected slots, in priority order. */
  picks: PreferenceSlot[];
  /** Receives the new ordered picks list. */
  onChange: (picks: PreferenceSlot[]) => void;
  /** "single" = 1x/week (max 2 picks: main + backup).
   *  "pair"   = 2x/week (max 4 picks: primary pair + backup pair). */
  mode: "single" | "pair";
  lang: Lang;
  /** When true, wrap slot labels onto two lines (start / end) so they fit in
   *  a narrow container (e.g. the admin detail-modal edit pane). Leave false
   *  for the public apply flow — single-line labels are part of that design. */
  compact?: boolean;
}

const sameSlot = (a: PreferenceSlot | null, b: PreferenceSlot) =>
  !!a && a.day === b.day && a.time === b.time;

/**
 * Pure state transition for the tap-a-slot interaction.
 *
 * Tap behaviour:
 *  - Tap an already-picked slot → remove it (later picks shift up).
 *  - Tap an unpicked slot → append, unless we're at maxPicks.
 *  - Same-day collision is rejected only **within the same group** (primary or
 *    backup). Cross-group same-day is fine — a parent's backup slot can fall
 *    on the same day as a primary slot of a different week shape.
 */
export function nextPicks(
  current: PreferenceSlot[],
  tapped: PreferenceSlot,
  maxPicks: number,
  primaryCount: number,
): { picks: PreferenceSlot[]; rejected: boolean } {
  const existingIdx = current.findIndex((p) => sameSlot(p, tapped));
  if (existingIdx >= 0) {
    return { picks: current.filter((_, i) => i !== existingIdx), rejected: false };
  }
  if (current.length >= maxPicks) return { picks: current, rejected: true };
  const newIdx = current.length;
  const groupStart = newIdx < primaryCount ? 0 : primaryCount;
  const groupEnd = newIdx < primaryCount ? primaryCount : maxPicks;
  for (let i = groupStart; i < Math.min(groupEnd, current.length); i++) {
    if (current[i].day === tapped.day) return { picks: current, rejected: true };
  }
  return { picks: [...current, tapped], rejected: false };
}

export function PreferenceSlotGrid({
  openDays,
  slotsByDay,
  picks,
  onChange,
  mode,
  lang,
  compact = false,
}: PreferenceSlotGridProps) {
  const isPair = mode === "pair";
  const maxPicks = isPair ? 4 : 2;
  const primaryCount = isPair ? 2 : 1;
  const badgeLabels = isPair
    ? [t("主1", "P1", lang), t("主2", "P2", lang), t("備1", "B1", lang), t("備2", "B2", lang)]
    : [t("主", "Main", lang), t("備", "Backup", lang)];

  // Inline blocked-tap toast — owning it here keeps the parent stateless.
  const [blocked, setBlocked] = useState<string | null>(null);
  useEffect(() => {
    if (!blocked) return;
    const tm = setTimeout(() => setBlocked(null), 2400);
    return () => clearTimeout(tm);
  }, [blocked]);

  // O(1) lookup so the cell render below is linear in cell count, not cells × picks.
  const pickIdx = new Map(picks.map((p, i) => [`${p.day}|${p.time}`, i]));

  const handleTap = (slot: PreferenceSlot) => {
    const result = nextPicks(picks, slot, maxPicks, primaryCount);
    if (result.rejected) {
      setBlocked(
        isPair
          ? t("主要時段的兩堂需於不同日子", "The two primary slots must be on different days", lang)
          : t("已選此日子", "You already picked this day", lang),
      );
      return;
    }
    onChange(result.picks);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 text-xs text-foreground leading-relaxed">
        {isPair
          ? t(
              "請點選每星期兩堂的兩個時段（不同日子）。可加選兩個後備時段。再次點擊可取消選擇。",
              "Tap two slots that make up your weekly pair (different days). You may then tap two more as a backup pair. Tap again to clear.",
              lang,
            )
          : t(
              "請點選您希望上課的時段。第一次點擊為主要時段，第二次為後備時段。再次點擊可取消選擇。",
              "Tap your preferred class time. The first tap is your main slot, the second is your backup. Tap again to clear.",
              lang,
            )}
      </div>

      <div className="space-y-5">
        {openDays.map((day) => {
          const slots = slotsByDay[day] || [];
          if (slots.length === 0) return null;
          return (
            <div key={day} className="space-y-2">
              <div className="text-sm font-semibold text-foreground">{dayLabel(day, lang)}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {slots.map((time) => {
                  const idx = pickIdx.get(`${day}|${time}`) ?? -1;
                  const isPrimary = idx >= 0 && idx < primaryCount;
                  const isBackup = idx >= primaryCount;
                  const labelParts = compact ? time.split(/\s*[-–]\s*/) : null;
                  return (
                    <button
                      key={time}
                      type="button"
                      onClick={() => handleTap({ day, time })}
                      aria-pressed={idx >= 0}
                      className={`relative cursor-pointer inline-flex items-center justify-center px-2 py-2 rounded-xl border-2 text-sm font-medium transition-all duration-150 ${
                        compact ? "" : "whitespace-nowrap"
                      } ${
                        isPrimary
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : isBackup
                          ? "bg-amber-50 text-amber-900 border-amber-300"
                          : "bg-card text-foreground border-border hover:border-primary/50 hover:bg-primary/5"
                      }`}
                    >
                      {labelParts && labelParts.length > 1 ? (
                        <span className="flex flex-col items-center leading-tight">
                          {labelParts.map((part, i) => (
                            <span key={i}>{part}</span>
                          ))}
                        </span>
                      ) : (
                        time
                      )}
                      {idx >= 0 && (
                        <span
                          className={`absolute -top-2 -right-2 inline-flex items-center justify-center min-w-[1.4rem] h-5 px-1 rounded-full text-[10px] font-bold shadow ring-2 ring-card ${
                            isPrimary ? "bg-amber-500 text-white" : "bg-amber-200 text-amber-900"
                          }`}
                        >
                          {badgeLabels[idx]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {blocked && (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
        >
          {blocked}
        </div>
      )}
    </div>
  );
}
