import { PenLine } from "lucide-react";
import type { SummerCourseFormConfig } from "@/types";
import {
  type Lang,
  t,
  sectionClass,
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

const SECONDARY_PREFIX = "MathConcept Secondary Academy";

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

  const educationCenters =
    config.center_options?.filter(
      (c) => !c.name_en.startsWith(SECONDARY_PREFIX)
    ) ?? [];
  const secondaryCenters =
    config.center_options?.filter((c) =>
      c.name_en.startsWith(SECONDARY_PREFIX)
    ) ?? [];

  const notStudentSelected = isExistingStudent === "None";
  const selectedCenter = currentCenters[0] ?? "";

  const selectCenter = (centerName: string, isSecondary: boolean) => {
    setIsExistingStudent(
      isSecondary ? "MathConcept Secondary Academy" : "MathConcept Education"
    );
    setCurrentCenters(() => [centerName]);
  };

  const selectNotStudent = () => {
    setIsExistingStudent("None");
    setCurrentCenters(() => []);
  };

  const educationLabel =
    config.existing_student_options.find(
      (o) => o.name_en === "MathConcept Education"
    );
  const secondaryLabel =
    config.existing_student_options.find(
      (o) => o.name_en === "MathConcept Secondary Academy"
    );
  const noneLabel = config.existing_student_options.find(
    (o) => o.name_en === "None"
  );

  const renderCenterChips = (
    centers: typeof educationCenters,
    isSecondary: boolean
  ) => {
    // Disambiguate by section — Education and Secondary can have centers
    // with the same display name, so match against isExistingStudent too.
    const sectionOrg = isSecondary
      ? "MathConcept Secondary Academy"
      : "MathConcept Education";
    return centers.map((c) => {
      const name = lang === "zh" ? c.name : c.name_en;
      const displayName = isSecondary ? shortCenterName(name) : name;
      const selected =
        !notStudentSelected &&
        isExistingStudent === sectionOrg &&
        selectedCenter === c.name;
      return (
        <label
          key={`${sectionOrg}:${c.name}`}
          className={radioLabelClass(selected)}
        >
          <input
            type="radio"
            name="currentCenter"
            checked={selected}
            onChange={() => selectCenter(c.name, isSecondary)}
            className="sr-only"
          />
          {selected && <RadioCheck />}
          {displayName}
        </label>
      );
    });
  };

  return (
    <div className={sectionClass}>
      <h2 className="text-base font-semibold text-foreground leading-snug">
        <IconLabel icon={PenLine}>
          {t(
            config.text_content?.existing_student_question_zh || "學生是否現正就讀於MathConcept旗下教育中心？",
            config.text_content?.existing_student_question_en || "Are you currently a MathConcept student?",
            lang
          )}
        </IconLabel>
        <RequiredMark />
      </h2>

      <div className="space-y-4">
        {educationCenters.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {lang === "zh" ? educationLabel?.name : educationLabel?.name_en}
            </div>
            <div className="flex flex-wrap gap-2.5">
              {renderCenterChips(educationCenters, false)}
            </div>
          </div>
        )}

        {secondaryCenters.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {lang === "zh" ? secondaryLabel?.name : secondaryLabel?.name_en}
            </div>
            <div className="flex flex-wrap gap-2.5">
              {renderCenterChips(secondaryCenters, true)}
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-border">
          <label className={radioLabelClass(notStudentSelected)}>
            <input
              type="radio"
              name="currentCenter"
              checked={notStudentSelected}
              onChange={selectNotStudent}
              className="sr-only"
            />
            {notStudentSelected && <RadioCheck />}
            {t(
              noneLabel?.name || "非MathConcept學生",
              noneLabel?.name_en || "Not a current MathConcept student",
              lang
            )}
          </label>
        </div>
      </div>
    </div>
  );
}
