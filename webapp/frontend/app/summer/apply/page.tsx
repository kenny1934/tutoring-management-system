"use client";

import { useState, useEffect, useCallback } from "react";
import { summerAPI } from "@/lib/api";
import type {
  SummerCourseFormConfig,
  SummerApplicationCreate,
} from "@/types";
import { CheckCircle2 } from "lucide-react";
import { type Lang, t } from "@/lib/summer-utils";
import {
  FormProgressBar,
  type StepStatus,
} from "@/components/summer/FormProgressBar";
import { FormNavButtons } from "@/components/summer/FormNavButtons";
import { StudentInfoStep } from "@/components/summer/steps/StudentInfoStep";
import { StudentBackgroundStep } from "@/components/summer/steps/StudentBackgroundStep";
import { ClassPreferencesStep } from "@/components/summer/steps/ClassPreferencesStep";
import { ContactBuddyStep } from "@/components/summer/steps/ContactBuddyStep";
import { ReviewSubmitStep } from "@/components/summer/steps/ReviewSubmitStep";

const TOTAL_STEPS = 5;

export default function SummerApplyPage() {
  const [lang, setLang] = useState<Lang>("zh");
  const [config, setConfig] = useState<SummerCourseFormConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{
    reference_code: string;
    buddy_code?: string | null;
  } | null>(null);
  const [currentStep, setCurrentStep] = useState(1);

  // Form state
  const [studentName, setStudentName] = useState("");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [langStream, setLangStream] = useState("");
  const [isExistingStudent, setIsExistingStudent] = useState("");
  const [currentCenters, setCurrentCenters] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [sessionsPerWeek, setSessionsPerWeek] = useState(1);
  const [pref1Day, setPref1Day] = useState("");
  const [pref1Time, setPref1Time] = useState("");
  const [pref2Day, setPref2Day] = useState("");
  const [pref2Time, setPref2Time] = useState("");
  const [unavailability, setUnavailability] = useState("");
  const [wechatId, setWechatId] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [buddyMode, setBuddyMode] = useState<"none" | "code" | "names">(
    "none"
  );
  const [buddyCode, setBuddyCode] = useState("");
  const [buddyNames, setBuddyNames] = useState("");
  const [buddyReferrerName, setBuddyReferrerName] = useState("");
  const [buddyCodeValid, setBuddyCodeValid] = useState<boolean | null>(null);
  const [buddyCodeIsOwn, setBuddyCodeIsOwn] = useState(false);
  const [buddyMemberCount, setBuddyMemberCount] = useState<number | null>(
    null
  );
  const [confirmed, setConfirmed] = useState(false);
  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [visitedSteps, setVisitedSteps] = useState<Set<number>>(
    () => new Set([1])
  );

  // Load config
  useEffect(() => {
    summerAPI
      .getFormConfig()
      .then(setConfig)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Validate buddy code
  const validateBuddyCode = useCallback(async (code: string) => {
    if (!code.trim()) {
      setBuddyCodeValid(null);
      setBuddyMemberCount(null);
      return;
    }
    try {
      const result = await summerAPI.getBuddyGroup(code.trim());
      setBuddyCodeValid(true);
      setBuddyCodeIsOwn(false);
      setBuddyMemberCount(result.member_count);
    } catch {
      setBuddyCodeValid(false);
      setBuddyCodeIsOwn(false);
      setBuddyMemberCount(null);
    }
  }, []);

  // Create buddy group
  const handleCreateBuddyGroup = async () => {
    try {
      const result = await summerAPI.createBuddyGroup();
      setBuddyCode(result.buddy_code);
      setBuddyMode("code");
      setBuddyCodeValid(true);
      setBuddyCodeIsOwn(true);
      setBuddyMemberCount(0);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to create buddy group"
      );
    }
  };

  // Reset buddy code selection (allow switching from creator to joiner)
  const handleResetBuddyCode = () => {
    setBuddyCode("");
    setBuddyCodeValid(null);
    setBuddyCodeIsOwn(false);
    setBuddyMemberCount(null);
    setBuddyReferrerName("");
  };

  // Per-step validation — returns error messages for missing required fields
  const getStepErrors = (step: number): string[] => {
    const errors: string[] = [];
    switch (step) {
      case 1:
        if (!studentName.trim())
          errors.push(
            t("請填寫學生英文姓名", "Please enter the student's English name", lang)
          );
        if (!school.trim())
          errors.push(
            t("請填寫學生就讀學校", "Please enter the student's current school", lang)
          );
        if (!grade)
          errors.push(t("請選擇年級", "Please select a grade", lang));
        if (
          config?.lang_stream_options &&
          config.lang_stream_options.length > 0 &&
          !langStream
        )
          errors.push(
            t("請選擇教學語言", "Please select a language stream", lang)
          );
        break;
      case 2:
        if (
          config?.existing_student_options &&
          config.existing_student_options.length > 0 &&
          !isExistingStudent
        )
          errors.push(
            t("請選擇是否現正就讀於MathConcept", "Please select whether you are a current MathConcept student", lang)
          );
        if (
          isExistingStudent &&
          isExistingStudent !== "None" &&
          currentCenters.length === 0
        )
          errors.push(
            t("請選擇現時所就讀的分校", "Please select your current center", lang)
          );
        break;
      case 3:
        if (!selectedLocation)
          errors.push(t("請選擇分校", "Please select a branch", lang));
        if (!pref1Day)
          errors.push(
            t("請選擇第一理想的上課日子", "Please select your 1st preferred day", lang)
          );
        if (!pref1Time)
          errors.push(
            t("請選擇第一理想的上課時間", "Please select your 1st preferred time", lang)
          );
        if (!pref2Day)
          errors.push(
            t("請選擇第二理想的上課日子", "Please select your 2nd preferred day", lang)
          );
        if (!pref2Time)
          errors.push(
            t("請選擇第二理想的上課時間", "Please select your 2nd preferred time", lang)
          );
        break;
      case 4:
        if (!wechatId.trim())
          errors.push(t("請提供微信號", "Please provide your WeChat ID", lang));
        if (!contactPhone.trim())
          errors.push(
            t("請填寫聯絡電話", "Please enter a contact phone number", lang)
          );
        if (buddyMode === "code" && buddyCodeValid && !buddyCodeIsOwn && !buddyReferrerName.trim())
          errors.push(
            t(
              "請填寫分享同行碼的朋友姓名",
              "Please enter the name of the friend who shared the buddy code",
              lang
            )
          );
        break;
    }
    return errors;
  };

  // Step navigation
  const goToStep = (step: number) => {
    setStepErrors([]);
    setCurrentStep(step);
    setVisitedSteps((prev) => {
      if (prev.has(step)) return prev;
      const next = new Set(prev);
      next.add(step);
      return next;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNext = () => {
    if (currentStep >= TOTAL_STEPS) return;
    const errors = getStepErrors(currentStep);
    if (errors.length > 0) {
      setStepErrors(errors);
      return;
    }
    goToStep(currentStep + 1);
  };

  const handlePrev = () => {
    if (currentStep > 1) goToStep(currentStep - 1);
  };

  const handleStepClick = (step: number) => {
    if (step !== currentStep) goToStep(step);
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed || submitting) return;

    // Validate ALL steps before submitting
    const allErrors: string[] = [];
    for (let step = 1; step < TOTAL_STEPS; step++) {
      allErrors.push(...getStepErrors(step));
    }
    if (allErrors.length > 0) {
      setStepErrors(allErrors);
      return;
    }

    setSubmitting(true);
    setError(null);

    const data: SummerApplicationCreate = {
      student_name: studentName,
      school: school || null,
      grade,
      lang_stream: langStream || null,
      is_existing_student: isExistingStudent || null,
      current_centers: currentCenters.length > 0 ? currentCenters : null,
      wechat_id: wechatId || null,
      contact_phone: contactPhone,
      preferred_location: selectedLocation || null,
      preference_1_day: pref1Day || null,
      preference_1_time: pref1Time || null,
      preference_2_day: pref2Day || null,
      preference_2_time: pref2Time || null,
      unavailability_notes: unavailability || null,
      buddy_code:
        buddyMode === "code" && buddyCodeValid ? buddyCode.trim() : null,
      buddy_names: buddyMode === "names" ? buddyNames : null,
      buddy_referrer_name:
        buddyMode === "code" && buddyCodeValid ? buddyReferrerName.trim() || null : null,
      form_language: lang,
      sessions_per_week: sessionsPerWeek,
    };

    try {
      const result = await summerAPI.submitApplication(data);
      setSubmitted({
        reference_code: result.reference_code,
        buddy_code: result.buddy_code,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      // Only show known user-facing messages; hide raw server errors
      const knownErrors = ["Application period is not open", "Invalid buddy code", "already submitted", "This phone number has already submitted"];
      setError(knownErrors.some(k => msg.includes(k)) ? msg : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // No active config or load error
  if (!config) {
    return (
      <div className="text-center py-20">
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            {error}
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-foreground">
              {t(
                "暑期課程報名尚未開放",
                "Summer course registration is not yet open",
                lang
              )}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {t("請稍後再試", "Please check back later", lang)}
            </p>
          </>
        )}
      </div>
    );
  }

  // Success state
  if (submitted) {
    return (
      <div className="bg-card rounded-2xl shadow-sm border border-border p-8 text-center space-y-4">
        <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" strokeWidth={2} />
        <h2 className="text-xl font-bold text-foreground">
          {t("報名成功！", "Application Submitted!", lang)}
        </h2>
        <div className="bg-primary/10 rounded-xl p-4 space-y-2">
          <div className="text-sm text-muted-foreground">
            {t("參考編號", "Reference Code", lang)}
          </div>
          <div className="text-2xl font-mono font-bold text-primary">
            {submitted.reference_code}
          </div>
        </div>
        {submitted.buddy_code && (
          <div className="bg-amber-50 rounded-xl p-4 space-y-2">
            <div className="text-sm text-muted-foreground">
              {t("同行優惠碼", "Buddy Group Code", lang)}
            </div>
            <div className="text-xl font-mono font-bold text-amber-700">
              {submitted.buddy_code}
            </div>
            <div className="text-xs text-muted-foreground">
              {t(
                "請分享此碼給您的朋友，他們報名時輸入即可加入同行優惠",
                "Share this code with your friends to join the group discount",
                lang
              )}
            </div>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {t(
            "請保存以上編號，可在狀態查詢頁面查看報名進度",
            "Please save the reference code above. You can check your application status on the status page.",
            lang
          )}
        </p>
        <p className="text-sm text-foreground">
          {t(
            config?.text_content?.success_message_zh || "再次感謝家長和學生對MathConcept「中學教室」的支持！",
            config?.text_content?.success_message_en || "Thank you again for your support of MathConcept Secondary Academy!",
            lang
          )}
        </p>
        <a
          href="/summer/status"
          className="inline-block mt-4 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary-hover transition-colors font-medium"
        >
          {t("查看報名狀態", "Check Status", lang)}
        </a>
      </div>
    );
  }

  // Compute step validation statuses for progress bar
  const stepStatuses: StepStatus[] = Array.from(
    { length: TOTAL_STEPS },
    (_, i) => {
      const step = i + 1;
      if (step === TOTAL_STEPS) return "default"; // Review step — no validation
      const errors = getStepErrors(step);
      if (errors.length === 0) return "complete";
      if (visitedSteps.has(step)) return "warning";
      return "default";
    }
  );

  // Render current step
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <StudentInfoStep
            config={config}
            lang={lang}
            studentName={studentName}
            setStudentName={setStudentName}
            school={school}
            setSchool={setSchool}
            grade={grade}
            setGrade={setGrade}
            langStream={langStream}
            setLangStream={setLangStream}
          />
        );
      case 2:
        return (
          <StudentBackgroundStep
            config={config}
            lang={lang}
            isExistingStudent={isExistingStudent}
            setIsExistingStudent={setIsExistingStudent}
            currentCenters={currentCenters}
            setCurrentCenters={setCurrentCenters}
          />
        );
      case 3:
        return (
          <ClassPreferencesStep
            config={config}
            lang={lang}
            selectedLocation={selectedLocation}
            setSelectedLocation={setSelectedLocation}
            sessionsPerWeek={sessionsPerWeek}
            setSessionsPerWeek={setSessionsPerWeek}
            pref1Day={pref1Day}
            setPref1Day={setPref1Day}
            pref1Time={pref1Time}
            setPref1Time={setPref1Time}
            pref2Day={pref2Day}
            setPref2Day={setPref2Day}
            pref2Time={pref2Time}
            setPref2Time={setPref2Time}
            unavailability={unavailability}
            setUnavailability={setUnavailability}
          />
        );
      case 4:
        return (
          <ContactBuddyStep
            config={config}
            lang={lang}
            wechatId={wechatId}
            setWechatId={setWechatId}
            contactPhone={contactPhone}
            setContactPhone={setContactPhone}
            buddyMode={buddyMode}
            setBuddyMode={setBuddyMode}
            buddyCode={buddyCode}
            setBuddyCode={setBuddyCode}
            buddyNames={buddyNames}
            setBuddyNames={setBuddyNames}
            buddyCodeValid={buddyCodeValid}
            setBuddyCodeValid={setBuddyCodeValid}
            buddyMemberCount={buddyMemberCount}
            validateBuddyCode={validateBuddyCode}
            handleCreateBuddyGroup={handleCreateBuddyGroup}
            onResetBuddyCode={handleResetBuddyCode}
            buddyReferrerName={buddyReferrerName}
            setBuddyReferrerName={setBuddyReferrerName}
            buddyCodeIsOwn={buddyCodeIsOwn}
          />
        );
      case 5:
        return (
          <ReviewSubmitStep
            config={config}
            lang={lang}
            studentName={studentName}
            school={school}
            grade={grade}
            langStream={langStream}
            isExistingStudent={isExistingStudent}
            currentCenters={currentCenters}
            selectedLocation={selectedLocation}
            sessionsPerWeek={sessionsPerWeek}
            pref1Day={pref1Day}
            pref1Time={pref1Time}
            pref2Day={pref2Day}
            pref2Time={pref2Time}
            unavailability={unavailability}
            wechatId={wechatId}
            contactPhone={contactPhone}
            buddyMode={buddyMode}
            buddyCode={buddyCode}
            buddyNames={buddyNames}
            buddyReferrerName={buddyReferrerName}
            confirmed={confirmed}
            setConfirmed={setConfirmed}
          />
        );
      default:
        return null;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto">
      {/* Progress bar with language toggle */}
      <FormProgressBar
        currentStep={currentStep}
        totalSteps={TOTAL_STEPS}
        lang={lang}
        stepStatuses={stepStatuses}
        onLangToggle={() => {
          setLang(lang === "zh" ? "en" : "zh");
          setStepErrors([]);
        }}
        onStepClick={handleStepClick}
      />

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step content with fade-in animation */}
      <div key={currentStep} className="animate-fade-in">
        {renderStep()}
      </div>

      {/* Navigation buttons */}
      <FormNavButtons
        currentStep={currentStep}
        totalSteps={TOTAL_STEPS}
        submitting={submitting}
        confirmed={confirmed}
        lang={lang}
        onNext={handleNext}
        onPrev={handlePrev}
        errors={stepErrors}
      />
    </form>
  );
}
