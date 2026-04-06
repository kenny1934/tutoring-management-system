import { dayLabel, type Lang, t } from "@/lib/summer-utils";

export interface PreferenceSlot {
  day: string;
  time: string;
}

interface PreferenceSlotGridProps {
  openDays: string[];
  slotsByDay: Record<string, string[]>;
  pref1: PreferenceSlot | null;
  pref2: PreferenceSlot | null;
  onChange: (pref1: PreferenceSlot | null, pref2: PreferenceSlot | null) => void;
  lang: Lang;
}

const sameSlot = (a: PreferenceSlot | null, b: PreferenceSlot) =>
  !!a && a.day === b.day && a.time === b.time;

export function PreferenceSlotGrid({
  openDays,
  slotsByDay,
  pref1,
  pref2,
  onChange,
  lang,
}: PreferenceSlotGridProps) {
  const handleTap = (slot: PreferenceSlot) => {
    if (sameSlot(pref1, slot)) {
      onChange(null, pref2);
      return;
    }
    if (sameSlot(pref2, slot)) {
      onChange(pref1, null);
      return;
    }
    if (!pref1) {
      onChange(slot, pref2);
      return;
    }
    onChange(pref1, slot);
  };

  const badgeFor = (slot: PreferenceSlot): 1 | 2 | null => {
    if (sameSlot(pref1, slot)) return 1;
    if (sameSlot(pref2, slot)) return 2;
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 text-xs text-foreground leading-relaxed">
        {t(
          "請依喜好次序點選兩個時段：第一次點擊為第一志願，第二次為第二志願。再次點擊可取消選擇。",
          "Tap two slots in preference order — first tap is your 1st choice, second is your 2nd. Tap again to clear a slot.",
          lang
        )}
      </div>

      <div className="space-y-5">
        {openDays.map((day) => {
          const slots = slotsByDay[day] || [];
          if (slots.length === 0) return null;
          return (
            <div key={day} className="space-y-2">
              <div className="text-sm font-semibold text-foreground">
                {dayLabel(day, lang)}
              </div>
              <div className="flex flex-wrap gap-2">
                {slots.map((time) => {
                  const slot: PreferenceSlot = { day, time };
                  const badge = badgeFor(slot);
                  const isFirst = badge === 1;
                  const isSecond = badge === 2;
                  const selected = isFirst || isSecond;
                  return (
                    <button
                      key={time}
                      type="button"
                      onClick={() => handleTap(slot)}
                      aria-pressed={selected}
                      className={`relative cursor-pointer inline-flex items-center justify-center px-3.5 py-2 rounded-xl border-2 text-sm font-medium transition-all duration-150 ${
                        isFirst
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : isSecond
                          ? "bg-primary/10 text-primary border-primary/60"
                          : "bg-card text-foreground border-border hover:border-primary/50 hover:bg-primary/5"
                      }`}
                    >
                      {time}
                      {badge && (
                        <span
                          className={`absolute -top-2 -right-2 inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shadow ring-2 ring-card ${
                            isFirst
                              ? "bg-amber-500 text-white"
                              : "bg-amber-200 text-amber-900"
                          }`}
                        >
                          {badge}
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
    </div>
  );
}
