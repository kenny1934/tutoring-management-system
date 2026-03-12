import { PenLine } from "lucide-react";
import type { SummerCourseFormConfig } from "@/types";
import {
  type Lang,
  t,
  sectionClass,
  labelClass,
  radioGroupClass,
  radioLabelClass,
  RadioCheck,
  RequiredMark,
  IconLabel,
  shortCenterName,
} from "@/lib/summer-utils";

interface StudentBackgroundStepProps {
  config: SummerCourseFormConfig;
  lang: Lang;
  isExistingStudent: string;
  setIsExistingStudent: (v: string) => void;
  currentCenters: string[];
  setCurrentCenters: (updater: (prev: string[]) => string[]) => void;
}

export function StudentBackgroundStep({
  config,
  lang,
  isExistingStudent,
  setIsExistingStudent,
  currentCenters,
  setCurrentCenters,
}: StudentBackgroundStepProps) {
  if (
    !config.existing_student_options ||
    config.existing_student_options.length === 0
  ) {
    return null;
  }

  const isSecondaryAcademy =
    config.existing_student_options.find(
      (o) => o.name_en === isExistingStudent || o.name === isExistingStudent
    )?.name_en === "MathConcept Secondary Academy";

  const filteredCenters = config.center_options?.filter((c) => {
    const isSecondaryCenter = c.name_en.startsWith(
      "MathConcept Secondary Academy"
    );
    return isSecondaryAcademy ? isSecondaryCenter : !isSecondaryCenter;
  });

  const showCenters =
    isExistingStudent &&
    isExistingStudent !== "None" &&
    filteredCenters &&
    filteredCenters.length > 0;

  return (
    <div className={sectionClass}>
      <h2 className="text-base font-semibold text-foreground leading-snug">
        <IconLabel icon={PenLine}>
          {t(
            "學生是否現正就讀於MathConcept旗下教育中心？（包括MathConcept數學思維 和 MathConcept中學教室）",
            "Are you currently a MathConcept's student? (Including MathConcept Education and MathConcept Secondary Academy)",
            lang
          )}
        </IconLabel>
        <RequiredMark />
      </h2>
      <div className={radioGroupClass}>
        {config.existing_student_options.map((opt) => {
          const value = opt.name_en;
          const label = lang === "zh" ? opt.name : opt.name_en;
          return (
            <label
              key={value}
              className={radioLabelClass(isExistingStudent === value)}
            >
              <input
                type="radio"
                name="existingStudent"
                value={value}
                checked={isExistingStudent === value}
                onChange={() => {
                  if (value === isExistingStudent) return;
                  setIsExistingStudent(value);
                  setCurrentCenters([]);
                }}
                className="sr-only"
              />
              {isExistingStudent === value && <RadioCheck />}
              {label}
            </label>
          );
        })}
      </div>

      {/* Center selection — animated expand/collapse */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          showCenters ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="pt-2">
            <label className={labelClass}>
              <IconLabel icon={PenLine}>
                {t(
                  "如為現讀學生，請選擇現時所就讀的分校：",
                  "If you are a current student, please select the center you are attending.",
                  lang
                )}
              </IconLabel>
              <RequiredMark />
            </label>
            <div className={radioGroupClass}>
              {filteredCenters?.map((c) => {
                const name = lang === "zh" ? c.name : c.name_en;
                const displayName = isSecondaryAcademy ? shortCenterName(name) : name;
                const selected = currentCenters.includes(c.name);
                return (
                  <label
                    key={c.name}
                    className={radioLabelClass(selected)}
                  >
                    <input
                      type="radio"
                      name="currentCenter"
                      checked={selected}
                      onChange={() => setCurrentCenters(() => [c.name])}
                      className="sr-only"
                    />
                    {selected && <RadioCheck />}
                    {displayName}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
