import Image from "next/image";
import type { SummerCourseFormConfig } from "@/types";
import {
  type Lang,
  t,
  dayLabel,
  inputClass,
  sectionClass,
  labelClass,
  radioGroupClass,
  radioLabelClass,
  RadioCheck,
  RequiredMark,
} from "@/lib/summer-utils";

const BRANCH_IMAGES: Record<string, string> = {
  "Jardim de Vasco Center": "/summer/vasco-center.jpg",
  "Flora Garden Center": "/summer/flora-center.jpg",
};

interface ClassPreferencesStepProps {
  config: SummerCourseFormConfig;
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
  unavailability: string;
  setUnavailability: (v: string) => void;
}

export function ClassPreferencesStep({
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
  unavailability,
  setUnavailability,
}: ClassPreferencesStepProps) {
  const selectedLocationData = config.locations.find(
    (l) => l.name === selectedLocation
  );
  const openDays = selectedLocationData?.open_days || [];

  return (
    <div className="space-y-6">
      {/* Branch selection */}
      <div className={sectionClass}>
        <h2 className="text-base font-semibold text-foreground leading-snug">
          {t(
            "MathConcept「中學教室」分別設有2間分校，請家長選擇理想分校\u{1F60A}",
            "MathConcept Secondary Academy has 2 branches respectively, please choose below \u{1F60A}:",
            lang
          )}
          <RequiredMark />
        </h2>
        <div className="space-y-4">
          {config.locations.map((loc) => {
            const name = lang === "zh" ? loc.name : loc.name_en;
            const addr =
              lang === "zh" ? loc.address : loc.address_en || loc.address;
            const daysLabel =
              lang === "zh"
                ? loc.open_days_label ||
                  loc.open_days.map((d) => dayLabel(d, lang)).join(", ")
                : loc.open_days_label_en ||
                  loc.open_days.map((d) => dayLabel(d, lang)).join(", ");
            const selected = selectedLocation === loc.name;
            const branchImage = BRANCH_IMAGES[loc.name_en];
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
                  <div className="relative aspect-[5/2] overflow-hidden">
                    <Image
                      src={branchImage}
                      alt={name}
                      fill
                      className="object-cover"
                    />
                    {selected && (
                      <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md text-sm">
                        ✓
                      </div>
                    )}
                  </div>
                )}
                <div className="p-4 space-y-1">
                  <div className="font-semibold text-sm">
                    {"\u{1F4CD}"} {name} ({daysLabel})
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
            {/* 1st preference */}
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium text-primary">
                  {t(
                    "\u{1F4E2} 請家長選擇 第一理想 上課日子和時間。",
                    "\u{1F4E2} Please select your first priority of day and time.",
                    lang
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {selectedLocationData &&
                    t(
                      `以下是${lang === "zh" ? selectedLocationData.name : selectedLocationData.name_en}提供的上課時間。`,
                      `Below are the time slots for ${selectedLocationData.name_en}:`,
                      lang
                    )}
                </div>
              </div>
              <div>
                <label className={labelClass}>
                  {t(
                    "\u{1F4C5} 請家長選擇 第一理想 的上課日子：",
                    "\u{1F4C5} Please select your first priority of day:",
                    lang
                  )}
                  <RequiredMark />
                </label>
                <div className={radioGroupClass}>
                  {openDays.map((d) => (
                    <label
                      key={d}
                      className={radioLabelClass(pref1Day === d)}
                    >
                      <input
                        type="radio"
                        name="pref1Day"
                        value={d}
                        checked={pref1Day === d}
                        onChange={() => setPref1Day(d)}
                        className="sr-only"
                      />
                      {pref1Day === d && <RadioCheck />}
                      {dayLabel(d, lang)}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>
                  {t(
                    "\u{1F552} 請家長選擇 第一理想 的上課時間段 ：",
                    "\u{1F552} Please select your first priority of time:",
                    lang
                  )}
                  <RequiredMark />
                </label>
                <div className={radioGroupClass}>
                  {config.time_slots.map((ts) => (
                    <label
                      key={ts}
                      className={radioLabelClass(pref1Time === ts)}
                    >
                      <input
                        type="radio"
                        name="pref1Time"
                        value={ts}
                        checked={pref1Time === ts}
                        onChange={() => setPref1Time(ts)}
                        className="sr-only"
                      />
                      {pref1Time === ts && <RadioCheck />}
                      {ts}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* 2nd preference */}
            <div className="space-y-3 pt-4 border-t border-border-subtle">
              <div>
                <div className="text-sm font-medium text-muted-foreground">
                  {t(
                    "\u{1F4E2} 請家長選擇 第二理想 上課日子和時間。",
                    "\u{1F4E2} Please select your second priority of day and time.",
                    lang
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {selectedLocationData &&
                    t(
                      `以下是${lang === "zh" ? selectedLocationData.name : selectedLocationData.name_en}提供的上課時間。`,
                      `Below are the time slots for ${selectedLocationData.name_en}:`,
                      lang
                    )}
                </div>
              </div>
              <div>
                <label className={labelClass}>
                  {t(
                    "\u{1F4C5} 請家長選擇 第二理想 的上課日子：",
                    "\u{1F4C5} Please select your second priority of day:",
                    lang
                  )}
                  <RequiredMark />
                </label>
                <div className={radioGroupClass}>
                  {openDays.map((d) => (
                    <label
                      key={d}
                      className={radioLabelClass(pref2Day === d)}
                    >
                      <input
                        type="radio"
                        name="pref2Day"
                        value={d}
                        checked={pref2Day === d}
                        onChange={() => setPref2Day(d)}
                        className="sr-only"
                      />
                      {pref2Day === d && <RadioCheck />}
                      {dayLabel(d, lang)}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>
                  {t(
                    "\u{1F552} 請家長選擇 第二理想 的上課時間段 ：",
                    "\u{1F552} Please select your second priority of time:",
                    lang
                  )}
                  <RequiredMark />
                </label>
                <div className={radioGroupClass}>
                  {config.time_slots.map((ts) => (
                    <label
                      key={ts}
                      className={radioLabelClass(pref2Time === ts)}
                    >
                      <input
                        type="radio"
                        name="pref2Time"
                        value={ts}
                        checked={pref2Time === ts}
                        onChange={() => setPref2Time(ts)}
                        className="sr-only"
                      />
                      {pref2Time === ts && <RadioCheck />}
                      {ts}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Unavailability */}
      <div className={sectionClass}>
        <label className={`${labelClass} leading-relaxed`}>
          {t(
            "\u{1F4C5} 為能令課堂安排更完整，如學生於暑假已有外出計劃或其他事宜不能出席課堂，請填上日子(如：7月14至21日)，讓導師們為您提早安排補堂。",
            "\u{1F4C5} In order to make the class arrangement more complete, if students have plans to go out during summer or are unable to attend class for other reasons, please fill in the date (for example: July 14 to 21). Our instructors can arrange make-up classes for you in advance.",
            lang
          )}
        </label>
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
