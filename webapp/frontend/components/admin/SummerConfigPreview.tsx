"use client";

import { memo, useState, useEffect } from "react";
import { type Lang, t, STEP_LABELS } from "@/lib/summer-utils";
import type { SummerCourseFormConfig } from "@/types";
import { StudentInfoStep } from "@/components/summer/steps/StudentInfoStep";
import { StudentBackgroundStep } from "@/components/summer/steps/StudentBackgroundStep";
import { ClassPreferencesStep } from "@/components/summer/steps/ClassPreferencesStep";
import { ContactBuddyStep } from "@/components/summer/steps/ContactBuddyStep";
import { ReviewSubmitStep } from "@/components/summer/steps/ReviewSubmitStep";

const noop = (..._args: unknown[]) => {};

const pillClass = (active: boolean) =>
  `px-2 py-0.5 text-[10px] rounded-md transition-colors font-medium ${
    active
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:text-foreground hover:bg-gray-100"
  }`;

function ControlBar({
  label,
  items,
  selected,
  onSelect,
  lang,
}: {
  label: string;
  items: { name: string; name_en: string }[];
  selected: string;
  onSelect: (value: string) => void;
  lang: Lang;
}) {
  if (items.length <= 1) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider shrink-0">
        {label}:
      </span>
      {items.map((item) => (
        <button
          key={item.name_en}
          type="button"
          onClick={() => onSelect(item.name_en)}
          className={pillClass(selected === item.name_en)}
        >
          {t(item.name, item.name_en, lang)}
        </button>
      ))}
    </div>
  );
}

interface SummerConfigPreviewProps {
  config: SummerCourseFormConfig;
  previewStep: number;
  onStepChange: (step: number) => void;
}

export const SummerConfigPreview = memo(function SummerConfigPreview({
  config,
  previewStep,
  onStepChange,
}: SummerConfigPreviewProps) {
  const [lang, setLang] = useState<Lang>("zh");
  const [previewLocation, setPreviewLocation] = useState(
    config.locations[0]?.name || ""
  );
  const [previewStudentType, setPreviewStudentType] = useState(
    config.existing_student_options?.[0]?.name_en || ""
  );

  // Reset selectors when config options change
  useEffect(() => {
    setPreviewLocation((prev) =>
      config.locations.some((l) => l.name === prev)
        ? prev
        : config.locations[0]?.name || ""
    );
    const firstOpt = config.existing_student_options?.[0]?.name_en || "";
    setPreviewStudentType((prev) =>
      config.existing_student_options?.some((o) => o.name_en === prev)
        ? prev
        : firstOpt
    );
  }, [config.locations, config.existing_student_options]);

  // Which controls to show per step
  const showLocationControl = previewStep === 3 || previewStep === 5;
  const showStudentTypeControl = previewStep === 2 || previewStep === 5;
  const showControls = showLocationControl || showStudentTypeControl;

  // Location items use name_en for ControlBar's key/comparison, but location
  // state tracks by name (zh). Adapt locations for ControlBar.
  const handleLocationSelect = (nameEn: string) => {
    const loc = config.locations.find((l) => l.name_en === nameEn);
    if (loc) setPreviewLocation(loc.name);
  };

  const locationItems = config.locations.map((l) => ({
    name: l.name,
    name_en: l.name_en,
  }));
  const selectedLocationEn =
    config.locations.find((l) => l.name === previewLocation)?.name_en || "";

  const renderStep = () => {
    switch (previewStep) {
      case 1:
        return (
          <StudentInfoStep
            config={config}
            lang={lang}
            studentName=""
            setStudentName={noop}
            school=""
            setSchool={noop}
            grade=""
            setGrade={noop}
          />
        );
      case 2:
        return (
          <StudentBackgroundStep
            config={config}
            lang={lang}
            isExistingStudent={previewStudentType}
            setIsExistingStudent={noop}
            currentCenters={[]}
            setCurrentCenters={noop}
          />
        );
      case 3:
        return (
          <ClassPreferencesStep
            config={config}
            lang={lang}
            selectedLocation={previewLocation}
            setSelectedLocation={noop}
            pref1Day=""
            setPref1Day={noop}
            pref1Time=""
            setPref1Time={noop}
            pref2Day=""
            setPref2Day={noop}
            pref2Time=""
            setPref2Time={noop}
            unavailability=""
            setUnavailability={noop}
          />
        );
      case 4:
        return (
          <ContactBuddyStep
            lang={lang}
            wechatId=""
            setWechatId={noop}
            contactPhone=""
            setContactPhone={noop}
            buddyMode="none"
            setBuddyMode={noop}
            buddyCode=""
            setBuddyCode={noop}
            buddyNames=""
            setBuddyNames={noop}
            buddyCodeValid={null}
            setBuddyCodeValid={noop}
            buddyMemberCount={null}
            validateBuddyCode={noop}
            handleCreateBuddyGroup={noop}
          />
        );
      case 5: {
        const loc = config.locations.find((l) => l.name === previewLocation);
        const firstDay = loc?.open_days[0] || "";
        const secondDay = loc?.open_days[1] || firstDay;
        const slots = loc?.time_slots?.[firstDay] || config.time_slots;
        return (
          <ReviewSubmitStep
            config={config}
            lang={lang}
            studentName="Bobby MC"
            school="Sample School"
            grade={config.available_grades[0]?.value || config.available_grades[0]?.name_en || ""}
            isExistingStudent={previewStudentType}
            currentCenters={[]}
            selectedLocation={previewLocation}
            pref1Day={firstDay}
            pref1Time={slots[0] || ""}
            pref2Day={secondDay}
            pref2Time={slots[1] || slots[0] || ""}
            unavailability=""
            wechatId="sample_wechat"
            contactPhone="12345678"
            buddyMode="none"
            buddyCode=""
            buddyNames=""
            confirmed={false}
            setConfirmed={noop}
          />
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="summer-light text-foreground bg-background flex flex-col h-full">
      {/* Preview header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 rounded-t-lg shrink-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Preview
        </span>
        <button
          type="button"
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
          className="text-xs text-primary hover:text-primary-hover font-medium"
        >
          {lang === "zh" ? "EN" : "中文"}
        </button>
      </div>

      {/* Step tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 bg-white shrink-0">
        {STEP_LABELS.map((label, i) => {
          const step = i + 1;
          const isCurrent = step === previewStep;
          return (
            <button
              key={step}
              type="button"
              onClick={() => onStepChange(step)}
              className={`px-2 py-1 text-[10px] sm:text-xs rounded-md transition-colors font-medium ${
                isCurrent
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-gray-100"
              }`}
            >
              {t(label.zh, label.en, lang)}
            </button>
          );
        })}
      </div>

      {/* Preview controls — contextual selectors for branching content */}
      {showControls && (
        <div className="px-3 py-2 border-b border-gray-200 bg-gray-50/50 space-y-1.5 shrink-0">
          {showLocationControl && (
            <ControlBar
              label="Branch"
              items={locationItems}
              selected={selectedLocationEn}
              onSelect={handleLocationSelect}
              lang={lang}
            />
          )}
          {showStudentTypeControl && config.existing_student_options && (
            <ControlBar
              label="Student"
              items={config.existing_student_options}
              selected={previewStudentType}
              onSelect={setPreviewStudentType}
              lang={lang}
            />
          )}
        </div>
      )}

      {/* Preview content — non-interactive, scrollable */}
      <div className="flex-1 overflow-y-auto bg-white rounded-b-lg">
        <div className="pointer-events-none select-none p-4 sm:p-6">
          {renderStep()}
        </div>
      </div>
    </div>
  );
});
