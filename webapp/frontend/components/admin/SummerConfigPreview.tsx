"use client";

import { memo, useState, useEffect } from "react";
import { type Lang, t, STEP_LABELS } from "@/lib/summer-utils";
import type { SummerCourseFormConfig } from "@/types";
import { StudentInfoStep } from "@/components/summer/steps/StudentInfoStep";
import { StudentBackgroundStep } from "@/components/summer/steps/StudentBackgroundStep";
import { ClassPreferencesStep } from "@/components/summer/steps/ClassPreferencesStep";
import { ContactBuddyStep } from "@/components/summer/steps/ContactBuddyStep";
import { ReviewSubmitStep } from "@/components/summer/steps/ReviewSubmitStep";
import {
  useSummerApplyFormState,
  FROZEN_SETTERS,
} from "@/hooks/useSummerApplyFormState";

const noop = () => {};

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

/** Renders a single step bound to a fresh form-state hook. Parent remounts
 *  this via `key` whenever the contextual selectors change so the hook's
 *  initial-seed path is the single source of truth for preview content —
 *  no imperative re-seeding via useEffect + hydrate. */
function PreviewStepBody({
  config,
  lang,
  previewStep,
  initial,
}: {
  config: SummerCourseFormConfig;
  lang: Lang;
  previewStep: number;
  initial: Parameters<typeof useSummerApplyFormState>[0];
}) {
  const form = useSummerApplyFormState(initial);
  switch (previewStep) {
    case 1:
      return (
        <StudentInfoStep
          config={config}
          lang={lang}
          studentName={form.studentName}
          setStudentName={FROZEN_SETTERS.setStudentName}
          school={form.school}
          setSchool={FROZEN_SETTERS.setSchool}
          grade={form.grade}
          setGrade={FROZEN_SETTERS.setGrade}
          langStream={form.langStream}
          setLangStream={FROZEN_SETTERS.setLangStream}
          previewMode
        />
      );
    case 2:
      return (
        <StudentBackgroundStep
          config={config}
          lang={lang}
          isExistingStudent={form.isExistingStudent}
          setIsExistingStudent={FROZEN_SETTERS.setIsExistingStudent}
          currentCenters={form.currentCenters}
          setCurrentCenters={FROZEN_SETTERS.setCurrentCenters}
        />
      );
    case 3:
      return (
        <ClassPreferencesStep
          config={config}
          lang={lang}
          selectedLocation={form.selectedLocation}
          setSelectedLocation={FROZEN_SETTERS.setSelectedLocation}
          sessionsPerWeek={form.sessionsPerWeek}
          setSessionsPerWeek={FROZEN_SETTERS.setSessionsPerWeek}
          pref1Day={form.pref1Day}
          setPref1Day={FROZEN_SETTERS.setPref1Day}
          pref1Time={form.pref1Time}
          setPref1Time={FROZEN_SETTERS.setPref1Time}
          pref2Day={form.pref2Day}
          setPref2Day={FROZEN_SETTERS.setPref2Day}
          pref2Time={form.pref2Time}
          setPref2Time={FROZEN_SETTERS.setPref2Time}
          pref3Day={form.pref3Day}
          setPref3Day={FROZEN_SETTERS.setPref3Day}
          pref3Time={form.pref3Time}
          setPref3Time={FROZEN_SETTERS.setPref3Time}
          pref4Day={form.pref4Day}
          setPref4Day={FROZEN_SETTERS.setPref4Day}
          pref4Time={form.pref4Time}
          setPref4Time={FROZEN_SETTERS.setPref4Time}
          unavailability={form.unavailability}
          setUnavailability={FROZEN_SETTERS.setUnavailability}
        />
      );
    case 4:
      return (
        <ContactBuddyStep
          config={config}
          lang={lang}
          wechatId={form.wechatId}
          setWechatId={FROZEN_SETTERS.setWechatId}
          contactPhone={form.contactPhone}
          setContactPhone={FROZEN_SETTERS.setContactPhone}
          buddyMode={form.buddyMode}
          setBuddyMode={FROZEN_SETTERS.setBuddyMode}
          buddyCode={form.buddyCode}
          setBuddyCode={FROZEN_SETTERS.setBuddyCode}
          buddyCodeValid={null}
          setBuddyCodeValid={noop}
          buddyMemberCount={null}
          validateBuddyCode={noop}
          handleCreateBuddyGroup={noop}
          onResetBuddyCode={noop}
          buddyReferrerName={form.buddyReferrerName}
          setBuddyReferrerName={FROZEN_SETTERS.setBuddyReferrerName}
          buddyCodeIsOwn={false}
          buddyGroupFull={false}
          buddyMaxMembers={3}
          declaredSibling={form.declaredSibling}
          setDeclaredSibling={FROZEN_SETTERS.setDeclaredSibling}
        />
      );
    case 5:
      return (
        <ReviewSubmitStep
          config={config}
          lang={lang}
          studentName={form.studentName}
          school={form.school}
          grade={form.grade}
          langStream={form.langStream}
          isExistingStudent={form.isExistingStudent}
          currentCenters={form.currentCenters}
          selectedLocation={form.selectedLocation}
          sessionsPerWeek={form.sessionsPerWeek}
          pref1Day={form.pref1Day}
          pref1Time={form.pref1Time}
          pref2Day={form.pref2Day}
          pref2Time={form.pref2Time}
          pref3Day={form.pref3Day}
          pref3Time={form.pref3Time}
          pref4Day={form.pref4Day}
          pref4Time={form.pref4Time}
          unavailability={form.unavailability}
          wechatId={form.wechatId}
          contactPhone={form.contactPhone}
          buddyMode={form.buddyMode}
          buddyCode={form.buddyCode}
          buddyReferrerName={form.buddyReferrerName}
          confirmed={false}
          setConfirmed={noop}
        />
      );
    default:
      return null;
  }
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

  const selectedLoc = config.locations.find((l) => l.name === previewLocation);
  const firstDay = selectedLoc?.open_days[0] || "";
  const secondDay = selectedLoc?.open_days[1] || firstDay;
  const sampleSlots = selectedLoc?.time_slots?.[firstDay] || config.time_slots;

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
          <PreviewStepBody
            key={`${previewStep}-${previewLocation}-${previewStudentType}`}
            config={config}
            lang={lang}
            previewStep={previewStep}
            initial={{
              studentName: "Bobby MC",
              school: "Sample School",
              grade: config.available_grades[0]?.value || config.available_grades[0]?.name_en || "",
              langStream: config.lang_stream_options?.[0]?.value || config.lang_stream_options?.[0]?.name_en || "",
              isExistingStudent: previewStudentType,
              selectedLocation: previewLocation,
              pref1Day: firstDay,
              pref1Time: sampleSlots[0] || "",
              pref2Day: secondDay,
              pref2Time: sampleSlots[1] || sampleSlots[0] || "",
              wechatId: "sample_wechat",
              contactPhone: "12345678",
            }}
          />
        </div>
      </div>
    </div>
  );
});
