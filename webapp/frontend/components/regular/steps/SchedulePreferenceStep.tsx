import Image from "next/image";
import { MapPin, Check } from "lucide-react";
import type { RegularCourseFormConfig } from "@/types";
import {
  type Lang,
  t,
  dayLabel,
  sectionClass,
  RequiredMark,
  WEEK_DAY_ORDER,
  DAY_SHORT_ZH,
  BRANCH_IMAGES_FALLBACK,
  getRegularTimeSlots,
} from "@/lib/regular-utils";
import {
  PreferenceSlotGrid,
  type PreferenceSlot,
} from "@/components/summer/PreferenceSlotGrid";

// Single-letter English weekday for the compact strip — distinct from
// summer-utils' 3-letter DAY_ABBREV.
const DAY_SHORT_EN: Record<string, string> = {
  Sunday: "S", Monday: "M", Tuesday: "T", Wednesday: "W",
  Thursday: "T", Friday: "F", Saturday: "S",
};

interface SchedulePreferenceStepProps {
  config: RegularCourseFormConfig;
  lang: Lang;
  selectedLocation: string;
  setSelectedLocation: (v: string) => void;
  pref1Day: string;
  setPref1Day: (v: string) => void;
  pref1Time: string;
  setPref1Time: (v: string) => void;
  pref2Day: string;
  setPref2Day: (v: string) => void;
  pref2Time: string;
  setPref2Time: (v: string) => void;
  /** Forwarded to PreferenceSlotGrid. See its prop doc. */
  compact?: boolean;
}

export function SchedulePreferenceStep({
  config,
  lang,
  selectedLocation,
  setSelectedLocation,
  pref1Day,
  setPref1Day,
  pref1Time,
  setPref1Time,
  pref2Day,
  setPref2Day,
  pref2Time,
  setPref2Time,
  compact = false,
}: SchedulePreferenceStepProps) {
  const selectedLocationData = config.locations.find(
    (l) => l.name === selectedLocation
  );
  const openDays = selectedLocationData?.open_days || [];

  const slotsByDay: Record<string, string[]> = {};
  for (const day of openDays) {
    slotsByDay[day] = getRegularTimeSlots(config, selectedLocation, day);
  }

  // Compose the two preference fields into one ordered picks list (compacted).
  const picks: PreferenceSlot[] = [];
  if (pref1Day && pref1Time) picks.push({ day: pref1Day, time: pref1Time });
  if (pref2Day && pref2Time) picks.push({ day: pref2Day, time: pref2Time });

  const writeBack = (next: PreferenceSlot[]) => {
    const at = (i: number) => next[i];
    setPref1Day(at(0)?.day ?? ""); setPref1Time(at(0)?.time ?? "");
    setPref2Day(at(1)?.day ?? ""); setPref2Time(at(1)?.time ?? "");
  };

  return (
    <div className="space-y-6">
      {/* Branch selection */}
      <div className={sectionClass}>
        <h2 className="text-base font-semibold text-foreground leading-snug">
          {t(
            "您希望在哪間分校上課？",
            "Which branch would you like to attend?",
            lang
          )}
          <RequiredMark />
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {config.locations.map((loc) => {
            const name = lang === "zh" ? loc.name : loc.name_en;
            const addr =
              lang === "zh" ? loc.address : loc.address_en || loc.address;
            const openSet = new Set(loc.open_days);
            const selected = selectedLocation === loc.name;
            const branchImage = loc.image_url || BRANCH_IMAGES_FALLBACK[loc.name_en];
            return (
              <label
                key={loc.name}
                className={`block cursor-pointer rounded-2xl border-2 overflow-hidden transition-all duration-200 ${
                  selected
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-md"
                    : "border-border hover:border-primary/50 hover:shadow-sm"
                }`}
              >
                <input
                  type="radio"
                  name="location"
                  value={loc.name}
                  checked={selected}
                  onChange={() => {
                    // Switching branch invalidates any picked slots — the new
                    // branch may have different open days and time slots.
                    setSelectedLocation(loc.name);
                    setPref1Day("");
                    setPref1Time("");
                    setPref2Day("");
                    setPref2Time("");
                  }}
                  className="sr-only"
                />
                {branchImage && (
                  <div className="relative aspect-[3/2] overflow-hidden">
                    <Image
                      src={branchImage}
                      alt={name}
                      fill
                      className="object-cover"
                    />
                    {selected && (
                      <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
                        <Check className="h-4 w-4" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                )}
                <div className="p-4 space-y-2">
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                    {name}
                  </div>
                  {/* Open-days strip — all 7 days always shown so closed days
                      read as "X day off" at a glance, mirroring a calendar
                      header. */}
                  <div className="flex items-center gap-1">
                    {WEEK_DAY_ORDER.map((day) => {
                      const isOpen = openSet.has(day);
                      const label = lang === "zh" ? DAY_SHORT_ZH[day] : DAY_SHORT_EN[day];
                      return (
                        <span
                          key={day}
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-semibold tabular-nums ${
                            isOpen
                              ? "bg-primary/15 text-primary"
                              : "text-muted-foreground/35 line-through decoration-muted-foreground/30"
                          }`}
                          aria-label={`${dayLabel(day, lang)} ${
                            isOpen
                              ? lang === "zh" ? "開放" : "open"
                              : lang === "zh" ? "休息" : "closed"
                          }`}
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                  <div className="text-xs text-muted-foreground">{addr}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Time preferences — animated expand */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          selectedLocation ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className={sectionClass}>
            <h2 className="text-base font-semibold text-foreground leading-snug">
              {t("請選擇上課時段", "Select your class times", lang)}
              <RequiredMark />
            </h2>
            <PreferenceSlotGrid
              openDays={openDays}
              slotsByDay={slotsByDay}
              picks={picks}
              onChange={writeBack}
              mode="single"
              lang={lang}
              compact={compact}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
