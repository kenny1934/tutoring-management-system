import Image from "next/image";
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
  RadioCheck,
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

  const pref1: PreferenceSlot | null =
    pref1Day && pref1Time ? { day: pref1Day, time: pref1Time } : null;
  const pref2: PreferenceSlot | null =
    pref2Day && pref2Time ? { day: pref2Day, time: pref2Time } : null;

  const handlePrefChange = (
    next1: PreferenceSlot | null,
    next2: PreferenceSlot | null
  ) => {
    setPref1Day(next1?.day ?? "");
    setPref1Time(next1?.time ?? "");
    setPref2Day(next2?.day ?? "");
    setPref2Time(next2?.time ?? "");
  };

  return (
    <div className="space-y-6">
      {/* Branch selection */}
      <div className={sectionClass}>
        <h2 className="text-base font-semibold text-foreground leading-snug">
          {t(
            `MathConcept「中學教室」分別設有${config.locations.length}間分校，請家長選擇理想分校：`,
            `MathConcept Secondary Academy has ${config.locations.length} branches. Please select your preferred one:`,
            lang
          )}
          <RequiredMark />
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="p-4 space-y-1">
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                    {name} ({daysLabel})
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
                "每星期上課次數",
                "Sessions per week",
                lang
              )}
              <RequiredMark />
            </h2>
            <p className="text-xs text-muted-foreground">
              {t(
                "每星期一次為標準安排（8周完成8堂），每星期兩次可於4周內完成課程。",
                "Once per week is the standard arrangement (8 lessons over 8 weeks). Twice per week completes the course in 4 weeks.",
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
                  {sessionsPerWeek === n && <RadioCheck />}
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
              {t(
                "請選擇上課時段",
                "Select your class times",
                lang
              )}
              <RequiredMark />
            </h2>
            <PreferenceSlotGrid
              openDays={openDays}
              slotsByDay={slotsByDay}
              pref1={pref1}
              pref2={pref2}
              onChange={handlePrefChange}
              lang={lang}
            />
          </div>
        </div>
      </div>

      {/* Unavailability */}
      <div className={sectionClass}>
        <label className={`${labelClass} leading-relaxed`}>
          <IconLabel icon={Calendar}>
            {t(
              config.text_content?.unavailability_prompt_zh || "為能令課堂安排更完整，如學生於暑假已有外出計劃或其他事宜不能出席課堂，請填上日子(如：7月14至21日)，讓導師們為您提早安排補堂。",
              config.text_content?.unavailability_prompt_en || "If your child will be unavailable on certain dates during summer (e.g. July 14\u201321), please let us know so we can arrange make-up classes in advance.",
              lang
            )}
          </IconLabel>
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
