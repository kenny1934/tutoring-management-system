import Image from "next/image";
import { useEffect } from "react";
import { MapPin, Calendar, Check } from "lucide-react";
import type { SummerCourseFormConfig } from "@/types";
import {
  type Lang,
  t,
  dayLabel,
  frequencyLabel,
  inputClass,
  sectionClass,
  labelClass,
  radioGroupClass,
  radioLabelClass,
  RequiredMark,
  IconLabel,
} from "@/lib/summer-utils";
import {
  PreferenceSlotGrid,
  type PreferenceSlot,
} from "@/components/summer/PreferenceSlotGrid";

const BRANCH_IMAGES_FALLBACK: Record<string, string> = {
  "Jardim de Vasco Center": "/summer/vasco-center.jpg",
  "Flora Garden Center": "/summer/flora-center.jpg",
};

// Calendar-style header order for the open-days strip on each branch card.
const WEEK_DAY_ORDER = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const DAY_SHORT_ZH: Record<string, string> = {
  Sunday: "日", Monday: "一", Tuesday: "二", Wednesday: "三",
  Thursday: "四", Friday: "五", Saturday: "六",
};
const DAY_SHORT_EN: Record<string, string> = {
  Sunday: "S", Monday: "M", Tuesday: "T", Wednesday: "W",
  Thursday: "T", Friday: "F", Saturday: "S",
};

interface ClassPreferencesStepProps {
  config: SummerCourseFormConfig;
  lang: Lang;
  selectedLocation: string;
  setSelectedLocation: (v: string) => void;
  sessionsPerWeek: number;
  setSessionsPerWeek: (v: number) => void;
  pref1Day: string;
  setPref1Day: (v: string) => void;
  pref1Time: string;
  setPref1Time: (v: string) => void;
  pref2Day: string;
  setPref2Day: (v: string) => void;
  pref2Time: string;
  setPref2Time: (v: string) => void;
  pref3Day: string;
  setPref3Day: (v: string) => void;
  pref3Time: string;
  setPref3Time: (v: string) => void;
  pref4Day: string;
  setPref4Day: (v: string) => void;
  pref4Time: string;
  setPref4Time: (v: string) => void;
  unavailability: string;
  setUnavailability: (v: string) => void;
}

export function ClassPreferencesStep({
  config,
  lang,
  selectedLocation,
  setSelectedLocation,
  sessionsPerWeek,
  setSessionsPerWeek,
  pref1Day,
  setPref1Day,
  pref1Time,
  setPref1Time,
  pref2Day,
  setPref2Day,
  pref2Time,
  setPref2Time,
  pref3Day,
  setPref3Day,
  pref3Time,
  setPref3Time,
  pref4Day,
  setPref4Day,
  pref4Time,
  setPref4Time,
  unavailability,
  setUnavailability,
}: ClassPreferencesStepProps) {
  const selectedLocationData = config.locations.find(
    (l) => l.name === selectedLocation
  );
  const openDays = selectedLocationData?.open_days || [];

  const slotsByDay: Record<string, string[]> = {};
  for (const day of openDays) {
    slotsByDay[day] =
      selectedLocationData?.time_slots?.[day] || config.time_slots;
  }

  const isPair = sessionsPerWeek === 2;

  // Compose the four pair fields into one ordered picks list (compacted).
  const picks: PreferenceSlot[] = [];
  if (pref1Day && pref1Time) picks.push({ day: pref1Day, time: pref1Time });
  if (pref2Day && pref2Time) picks.push({ day: pref2Day, time: pref2Time });
  if (pref3Day && pref3Time) picks.push({ day: pref3Day, time: pref3Time });
  if (pref4Day && pref4Time) picks.push({ day: pref4Day, time: pref4Time });

  const writeBack = (next: PreferenceSlot[]) => {
    const at = (i: number) => next[i];
    setPref1Day(at(0)?.day ?? ""); setPref1Time(at(0)?.time ?? "");
    setPref2Day(at(1)?.day ?? ""); setPref2Time(at(1)?.time ?? "");
    setPref3Day(at(2)?.day ?? ""); setPref3Time(at(2)?.time ?? "");
    setPref4Day(at(3)?.day ?? ""); setPref4Time(at(3)?.time ?? "");
  };

  // Switching from 2x → 1x must drop the now-orphaned pref3/pref4 so they
  // don't survive into the submitted payload.
  useEffect(() => {
    if (!isPair && (pref3Day || pref4Day)) {
      setPref3Day(""); setPref3Time("");
      setPref4Day(""); setPref4Time("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPair]);

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
                  {/* Open-days strip — replaces the old prose label. All 7
                      days always shown so closed days read as "X day off"
                      at a glance, mirroring a calendar header. */}
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

      {/* Frequency selector — animated expand */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          selectedLocation ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className={sectionClass}>
            <h2 className="text-base font-semibold text-foreground leading-snug">
              {t(
                "每星期堂數",
                "Lessons per week",
                lang
              )}
              <RequiredMark />
            </h2>
            <p className="text-xs text-muted-foreground">
              {t(
                "每星期一堂為標準安排（8周完成8堂），每星期兩堂可於4周內完成課程。",
                "One lesson per week is the standard arrangement (8 lessons over 8 weeks). Two lessons per week completes the course in 4 weeks.",
                lang
              )}
            </p>
            <div className={radioGroupClass}>
              {[1, 2].map((n) => (
                <label
                  key={n}
                  className={radioLabelClass(sessionsPerWeek === n)}
                >
                  <input
                    type="radio"
                    name="sessionsPerWeek"
                    value={n}
                    checked={sessionsPerWeek === n}
                    onChange={() => setSessionsPerWeek(n)}
                    className="sr-only"
                  />
                  {frequencyLabel(n, lang)}
                </label>
              ))}
            </div>
          </div>
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
              {isPair
                ? t("請選擇上課時段（每星期兩堂）", "Select your class times (two lessons per week)", lang)
                : t("請選擇上課時段", "Select your class times", lang)}
              <RequiredMark />
            </h2>
            <PreferenceSlotGrid
              openDays={openDays}
              slotsByDay={slotsByDay}
              picks={picks}
              onChange={writeBack}
              mode={isPair ? "pair" : "single"}
              lang={lang}
            />
          </div>
        </div>
      </div>

      {/* Unavailability */}
      <div className={sectionClass}>
        <label className={labelClass}>
          <IconLabel icon={Calendar}>
            {t(
              "暑假期間有不能上課的日子嗎？",
              "Any dates the student can't attend?",
              lang
            )}
          </IconLabel>
        </label>
        <p className="text-xs text-muted-foreground -mt-1 mb-2 leading-relaxed">
          {t(
            "提早告訴我們，方便為您安排補堂，令課程更完整。",
            "Let us know in advance so we can arrange make-up classes and keep the schedule complete.",
            lang
          )}
        </p>
        <textarea
          value={unavailability}
          onChange={(e) => setUnavailability(e.target.value)}
          rows={3}
          className={inputClass}
          placeholder={t(
            "如：7月14至21日",
            "for example: July 14 to 21",
            lang
          )}
        />
      </div>
    </div>
  );
}
