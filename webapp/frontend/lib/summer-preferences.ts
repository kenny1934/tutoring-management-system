/**
 * Single source of truth for summer-application preference tier semantics.
 *
 * The DB stores 4 flat (day, time) pairs (pref1..pref4). What they MEAN
 * depends on `sessions_per_week`:
 *   - 1x/week: pref1 = main slot, pref2 = backup slot. pref3/pref4 unused.
 *   - 2x/week: pref1 + pref2 = primary weekly pair. pref3 + pref4 = optional
 *              backup pair.
 *
 * Every UI surface that displays or matches against a parent's preferences
 * needs this rule. Keeping it inlined in each consumer drifts fast — bugs
 * here would silently miscount demand or mis-highlight slots, so the rule
 * lives here and nowhere else.
 */

export interface PrefSlot {
  day: string;
  time: string;
}

interface PrefSource {
  sessions_per_week?: number | null;
  preference_1_day?: string | null;
  preference_1_time?: string | null;
  preference_2_day?: string | null;
  preference_2_time?: string | null;
  preference_3_day?: string | null;
  preference_3_time?: string | null;
  preference_4_day?: string | null;
  preference_4_time?: string | null;
}

const slot = (d?: string | null, t?: string | null): PrefSlot | null =>
  d && t ? { day: d, time: t } : null;

export interface ClassifiedPrefs {
  isPair: boolean;
  /** Compacted (no nulls), in priority order. */
  primary: PrefSlot[];
  /** Compacted (no nulls), in priority order. */
  backup: PrefSlot[];
}

export function classifyPrefs(app: PrefSource): ClassifiedPrefs {
  const isPair = (app.sessions_per_week ?? 1) >= 2;
  const s1 = slot(app.preference_1_day, app.preference_1_time);
  const s2 = slot(app.preference_2_day, app.preference_2_time);
  const s3 = slot(app.preference_3_day, app.preference_3_time);
  const s4 = slot(app.preference_4_day, app.preference_4_time);
  if (isPair) {
    return {
      isPair,
      primary: [s1, s2].filter((x): x is PrefSlot => x != null),
      backup: [s3, s4].filter((x): x is PrefSlot => x != null),
    };
  }
  return {
    isPair,
    primary: s1 ? [s1] : [],
    backup: s2 ? [s2] : [],
  };
}

/** Flatten primary + backup back into one ordered list (e.g. for grid highlights). */
export function allPrefSlots(app: PrefSource): PrefSlot[] {
  const { primary, backup } = classifyPrefs(app);
  return [...primary, ...backup];
}
