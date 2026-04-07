"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { summerAPI } from "@/lib/api";
import type {
  SummerCourseFormConfig,
  SummerApplicationCreate,
} from "@/types";
import { useSummerApplyFormState } from "@/hooks/useSummerApplyFormState";
import { CheckCircle2, Copy, Check, Pencil } from "lucide-react";
import { BuddyCodeCard } from "@/components/summer/BuddyCodeCard";
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

  // Form data state lives in a shared hook so the admin config preview stays
  // structurally in sync — adding a field forces both consumers to handle it.
  const form = useSummerApplyFormState();
  const {
    studentName, setStudentName,
    school, setSchool,
    grade, setGrade,
    langStream, setLangStream,
    isExistingStudent, setIsExistingStudent,
    currentCenters, setCurrentCenters,
    selectedLocation, setSelectedLocation,
    sessionsPerWeek, setSessionsPerWeek,
    pref1Day, setPref1Day,
    pref1Time, setPref1Time,
    pref2Day, setPref2Day,
    pref2Time, setPref2Time,
    pref3Day, setPref3Day,
    pref3Time, setPref3Time,
    pref4Day, setPref4Day,
    pref4Time, setPref4Time,
    unavailability, setUnavailability,
    wechatId, setWechatId,
    contactPhone, setContactPhone,
    buddyMode, setBuddyMode,
    buddyCode, setBuddyCode,
    buddyReferrerName, setBuddyReferrerName,
    declaredSibling, setDeclaredSibling,
  } = form;

  // UI / interactive state that isn't persisted to draft stays local.
  const [confirmed, setConfirmed] = useState(false);
  const [buddyCodeValid, setBuddyCodeValid] = useState<boolean | null>(null);
  const [buddyCodeIsOwn, setBuddyCodeIsOwn] = useState(false);
  const [buddyGroupFull, setBuddyGroupFull] = useState(false);
  const [buddyMaxMembers, setBuddyMaxMembers] = useState(3);
  const [buddyMemberCount, setBuddyMemberCount] = useState<number | null>(null);
  const [refCopied, setRefCopied] = useState(false);
  const refCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (refCopyTimer.current) clearTimeout(refCopyTimer.current); }, []);
  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [visitedSteps, setVisitedSteps] = useState<Set<number>>(
    () => new Set([1])
  );

  // Draft persistence: stash form state to localStorage so a reload / accidental
  // close doesn't lose half-filled data. Restored only after explicit Resume to
  // avoid surprising users on shared devices.
  const [pendingDraft, setPendingDraft] = useState<Record<string, unknown> | null>(null);
  const draftHydrated = useRef(false);

  // Load config
  useEffect(() => {
    summerAPI
      .getFormConfig()
      .then(setConfig)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Title used to live as a prominent <h1> inside Step 1. We demoted that
  // zone and now surface it as the browser tab title instead, so the form
  // layout stays calm while the brand/year is still visible in the tab bar.
  useEffect(() => {
    if (!config) return;
    const zhTitle = config.text_content?.title_zh || config.title;
    const enTitle = config.text_content?.title_en || config.title;
    document.title = `${lang === "zh" ? zhTitle : enTitle} | MathConcept`;
  }, [config, lang]);

  const draftKey = config ? `summer-apply-draft-${config.year}` : null;

  // Read any saved draft once per year-scoped key. The parsed payload is held
  // in state so resume can rehydrate without re-parsing localStorage.
  useEffect(() => {
    if (!draftKey || draftHydrated.current) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.savedAt === "number") {
        setPendingDraft(parsed);
      }
    } catch {
      localStorage.removeItem(draftKey);
    }
  }, [draftKey]);

  const resumeDraft = () => {
    const d = pendingDraft;
    if (d) {
      form.hydrate(d);
      if (typeof d.currentStep === "number" && d.currentStep >= 1 && d.currentStep <= TOTAL_STEPS) {
        setCurrentStep(d.currentStep);
        setVisitedSteps(new Set(Array.from({ length: d.currentStep }, (_, i) => i + 1)));
      }
    }
    draftHydrated.current = true;
    setPendingDraft(null);
  };

  const discardDraft = () => {
    if (draftKey) localStorage.removeItem(draftKey);
    draftHydrated.current = true;
    setPendingDraft(null);
  };

  const formIsDirty =
    !!studentName || !!school || !!grade || !!langStream || !!isExistingStudent ||
    currentCenters.length > 0 || !!selectedLocation || sessionsPerWeek !== 1 ||
    !!pref1Day || !!pref1Time || !!pref2Day || !!pref2Time || !!unavailability ||
    !!wechatId || !!contactPhone || !!buddyCode || !!buddyReferrerName ||
    declaredSibling !== null;

  // Native browser confirmation on refresh/close. The localStorage draft is a
  // safety net, but most users won't notice the resume banner if they just hit
  // reload — this catches the slip before it happens.
  useEffect(() => {
    if (!formIsDirty || submitted) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [formIsDirty, submitted]);

  useEffect(() => {
    if (!draftKey || pendingDraft || submitted) return;
    // Skip until the user has actually touched the form — otherwise the very
    // first render with empty fields would overwrite the saved draft before
    // the user could resume it.
    if (!draftHydrated.current) {
      if (!formIsDirty) return;
      draftHydrated.current = true;
    }
    const handle = setTimeout(() => {
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({ savedAt: Date.now(), currentStep, ...form.snapshot() }),
        );
      } catch {
        // Quota exceeded or storage disabled — fail silently, draft is best-effort.
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [
    draftKey, pendingDraft, submitted, formIsDirty,
    currentStep,
    studentName, school, grade, langStream,
    isExistingStudent, currentCenters,
    selectedLocation, sessionsPerWeek,
    pref1Day, pref1Time, pref2Day, pref2Time, unavailability,
    wechatId, contactPhone,
    buddyMode, buddyCode, buddyReferrerName, declaredSibling,
  ]);

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
      setBuddyGroupFull(result.is_full);
      setBuddyMaxMembers(result.max_members);
    } catch {
      setBuddyCodeValid(false);
      setBuddyCodeIsOwn(false);
      setBuddyMemberCount(null);
      setBuddyGroupFull(false);
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
      // The applicant will become member 1 upon submitting this form —
      // show the count from their perspective so "N more needed" reads correctly.
      setBuddyMemberCount(1);
      setBuddyGroupFull(false);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to create buddy group"
      );
    }
  };

  // Reset buddy code selection (allow switching from creator to joiner)
  const handleBuddyModeChange = (mode: "none" | "code") => {
    setBuddyMode(mode);
    if (mode !== "code") {
      setBuddyCodeValid(null);
      setBuddyMemberCount(null);
      setBuddyGroupFull(false);
      setDeclaredSibling(null);
    }
  };

  const handleResetBuddyCode = () => {
    setBuddyCode("");
    setBuddyCodeValid(null);
    setBuddyCodeIsOwn(false);
    setBuddyMemberCount(null);
    setBuddyGroupFull(false);
    setBuddyReferrerName("");
    setDeclaredSibling(null);
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
          !(isExistingStudent === "None" || currentCenters.length > 0)
        )
          errors.push(
            t(
              "請選擇現時就讀的分校或表示非MathConcept學生",
              "Please select your current center or indicate you are not a MathConcept student",
              lang
            )
          );
        break;
      case 3:
        if (!selectedLocation)
          errors.push(t("請選擇分校", "Please select a branch", lang));
        if (!pref1Day || !pref1Time)
          errors.push(
            t("請選擇上課時段", "Please select a class time", lang)
          );
        if (sessionsPerWeek === 2) {
          // Twice/week: pref1 + pref2 = primary pair (both required, different
          // days). pref3 + pref4 = optional backup pair; if either is set both
          // must be set, also different days.
          if (!pref2Day || !pref2Time)
            errors.push(
              t(
                "每星期兩堂：請選擇兩個主要上課時段",
                "Two lessons per week: please pick two primary time slots",
                lang
              )
            );
          if (pref1Day && pref2Day && pref1Day === pref2Day)
            errors.push(
              t(
                "每星期兩堂的兩個時段需於不同日子",
                "The two primary slots must be on different days",
                lang
              )
            );
          const backupHasOne = !!(pref3Day && pref3Time);
          const backupHasTwo = !!(pref4Day && pref4Time);
          if (backupHasOne !== backupHasTwo)
            errors.push(
              t(
                "後備時段需同時選擇兩個時段",
                "Please pick both backup slots, or leave both empty",
                lang
              )
            );
          if (pref3Day && pref4Day && pref3Day === pref4Day)
            errors.push(
              t(
                "後備時段需於不同日子",
                "The two backup slots must be on different days",
                lang
              )
            );
        }
        // sessionsPerWeek === 1: pref2 is now an optional backup, no check.
        break;
      case 4:
        if (!wechatId.trim())
          errors.push(t("請提供微信號", "Please provide your WeChat ID", lang));
        if (!contactPhone.trim())
          errors.push(
            t("請填寫聯絡電話", "Please enter a contact phone number", lang)
          );
        if (buddyMode === "code" && !buddyCodeIsOwn && buddyCode.trim() && !buddyCodeValid)
          errors.push(
            t(
              "請先驗證同行碼",
              "Please verify the buddy code first",
              lang
            )
          );
        if (buddyMode === "code" && buddyCodeValid && !buddyCodeIsOwn && buddyGroupFull)
          errors.push(
            t(
              `此同行組已滿（最多${buddyMaxMembers}人）。請建立新的同行碼或輸入其他同行碼。`,
              `This group is already full (max ${buddyMaxMembers} members). Please create a new code or enter a different one.`,
              lang
            )
          );
        if (buddyMode === "code" && buddyCodeValid && !buddyCodeIsOwn && !buddyGroupFull && !buddyReferrerName.trim())
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
      preference_3_day: pref3Day || null,
      preference_3_time: pref3Time || null,
      preference_4_day: pref4Day || null,
      preference_4_time: pref4Time || null,
      unavailability_notes: unavailability || null,
      buddy_code:
        buddyMode === "code" && buddyCodeValid ? buddyCode.trim() : null,
      buddy_names: null,
      buddy_referrer_name:
        buddyMode === "code" && buddyCodeValid ? buddyReferrerName.trim() || null : null,
      form_language: lang,
      sessions_per_week: sessionsPerWeek,
      declared_sibling:
        buddyMode === "code" && buddyCodeValid && declaredSibling ? declaredSibling : null,
    };

    try {
      const result = await summerAPI.submitApplication(data);
      setSubmitted({
        reference_code: result.reference_code,
        buddy_code: result.buddy_code,
      });
      if (draftKey) localStorage.removeItem(draftKey);
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
            <a
              href="/summer/status"
              className="inline-block mt-6 text-sm text-primary hover:text-primary-hover underline"
            >
              {t("已遞交申請？查看報名狀態 →", "Already applied? Check your status →", lang)}
            </a>
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
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(submitted.reference_code);
                if (refCopyTimer.current) clearTimeout(refCopyTimer.current);
                setRefCopied(true);
                refCopyTimer.current = setTimeout(() => setRefCopied(false), 2000);
              } catch {
                // clipboard denied
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/15 transition-colors mx-auto"
          >
            {refCopied ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-600" />
                {t("已複製", "Copied", lang)}
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-primary" />
                {t("複製編號", "Copy Code", lang)}
              </>
            )}
          </button>
        </div>
        {submitted.buddy_code && (
          <BuddyCodeCard
            code={submitted.buddy_code}
            lang={lang}
            variant="amber"
            subtitle={t(
              "請分享此碼給您的朋友，他們報名時輸入即可加入同行優惠",
              "Share this code with your friends to join the group discount",
              lang
            )}
          />
        )}

        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-left space-y-3">
          <div className="flex items-start gap-2.5">
            <Pencil className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="text-sm text-foreground leading-relaxed">
              <div className="font-semibold mb-0.5">
                {t("請保存您的參考編號", "Save your reference code", lang)}
              </div>
              <div className="text-muted-foreground text-xs leading-relaxed">
                {t(
                  "用參考編號及聯絡電話即可在狀態查詢頁面隨時查看報名進度，及加入、建立或更改同行碼。",
                  "Use your reference code and contact phone anytime on the status page to check your application progress and to join, create, or change a buddy code.",
                  lang
                )}
              </div>
            </div>
          </div>
          <a
            href="/summer/status"
            className="block w-full text-center px-6 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary-hover transition-colors font-medium text-sm"
          >
            {t("前往狀態查詢頁面 →", "Go to Status Page →", lang)}
          </a>
        </div>

        <p className="text-sm text-foreground">
          {t(
            config?.text_content?.success_message_zh || "再次感謝家長和學生對MathConcept「中學教室」的支持！",
            config?.text_content?.success_message_en || "Thank you again for your support of MathConcept Secondary Academy!",
            lang
          )}
        </p>
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
            pref3Day={pref3Day}
            setPref3Day={setPref3Day}
            pref3Time={pref3Time}
            setPref3Time={setPref3Time}
            pref4Day={pref4Day}
            setPref4Day={setPref4Day}
            pref4Time={pref4Time}
            setPref4Time={setPref4Time}
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
            setBuddyMode={handleBuddyModeChange}
            buddyCode={buddyCode}
            setBuddyCode={setBuddyCode}
            buddyCodeValid={buddyCodeValid}
            setBuddyCodeValid={setBuddyCodeValid}
            buddyMemberCount={buddyMemberCount}
            validateBuddyCode={validateBuddyCode}
            handleCreateBuddyGroup={handleCreateBuddyGroup}
            onResetBuddyCode={handleResetBuddyCode}
            buddyReferrerName={buddyReferrerName}
            setBuddyReferrerName={setBuddyReferrerName}
            buddyCodeIsOwn={buddyCodeIsOwn}
            buddyGroupFull={buddyGroupFull}
            buddyMaxMembers={buddyMaxMembers}
            declaredSibling={declaredSibling}
            setDeclaredSibling={setDeclaredSibling}
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
            pref3Day={pref3Day}
            pref3Time={pref3Time}
            pref4Day={pref4Day}
            pref4Time={pref4Time}
            unavailability={unavailability}
            wechatId={wechatId}
            contactPhone={contactPhone}
            buddyMode={buddyMode}
            buddyCode={buddyCode}
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
      {pendingDraft && typeof pendingDraft.savedAt === "number" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-center gap-2 flex-wrap">
          <span>
            {t(
              `偵測到上次未完成的報名草稿（${new Date(pendingDraft.savedAt).toLocaleString()}）。要繼續填寫嗎？`,
              `Found an unfinished draft from ${new Date(pendingDraft.savedAt).toLocaleString()}. Resume?`,
              lang,
            )}
          </span>
          <span className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={resumeDraft}
              className="px-2 py-0.5 rounded bg-amber-600 text-white font-medium hover:bg-amber-700"
            >
              {t("繼續填寫", "Resume", lang)}
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="px-2 py-0.5 rounded text-amber-900 hover:bg-amber-100"
            >
              {t("放棄", "Discard", lang)}
            </button>
          </span>
        </div>
      )}

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

      {currentStep === 1 && (
        <div className="text-center">
          <a
            href="/summer/status"
            className="text-xs text-muted-foreground hover:text-primary transition-colors underline"
          >
            {t("已遞交申請？查看報名狀態 →", "Already applied? Check your status →", lang)}
          </a>
        </div>
      )}

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
