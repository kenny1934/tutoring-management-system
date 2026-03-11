"use client";

import { useState, useEffect, useCallback } from "react";
import { summerAPI } from "@/lib/api";
import type {
  SummerCourseFormConfig,
  SummerApplicationCreate,
} from "@/types";
import { type Lang, t, dayLabel, inputClass } from "@/lib/summer-utils";

/** Format a date string like "2025-07-05" to localized display. */
function formatDate(dateStr: string, lang: Lang): string {
  const d = new Date(dateStr + "T00:00:00");
  if (lang === "zh") {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

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

  // Form state
  const [studentName, setStudentName] = useState("");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [langStream, setLangStream] = useState("");
  const [isExistingStudent, setIsExistingStudent] = useState("");
  const [currentCenters, setCurrentCenters] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [pref1Day, setPref1Day] = useState("");
  const [pref1Time, setPref1Time] = useState("");
  const [pref2Day, setPref2Day] = useState("");
  const [pref2Time, setPref2Time] = useState("");
  const [unavailability, setUnavailability] = useState("");
  const [wechatId, setWechatId] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [buddyMode, setBuddyMode] = useState<"none" | "code" | "names">("none");
  const [buddyCode, setBuddyCode] = useState("");
  const [buddyNames, setBuddyNames] = useState("");
  const [buddyCodeValid, setBuddyCodeValid] = useState<boolean | null>(null);
  const [buddyMemberCount, setBuddyMemberCount] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // Load config
  useEffect(() => {
    summerAPI
      .getFormConfig()
      .then(setConfig)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Derive open days for selected location
  const selectedLocationData = config?.locations.find(
    (l) => l.name === selectedLocation
  );
  const openDays = selectedLocationData?.open_days || [];

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
      setBuddyMemberCount(result.member_count);
    } catch {
      setBuddyCodeValid(false);
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
      setBuddyMemberCount(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create buddy group");
    }
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed || submitting) return;

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
      form_language: lang,
    };

    try {
      const result = await summerAPI.submitApplication(data);
      setSubmitted({
        reference_code: result.reference_code,
        buddy_code: result.buddy_code,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submission failed");
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

  // No active config
  if (!config) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold text-foreground">
          {t("暑期課程報名尚未開放", "Summer course registration is not yet open", lang)}
        </h2>
        <p className="mt-2 text-muted-foreground">
          {t("請稍後再試", "Please check back later", lang)}
        </p>
      </div>
    );
  }

  // Derive pricing for introduction block
  const pricing = config.pricing_config;
  const ebDiscount = pricing.discounts?.find((d) => d.code === "EB");
  const eb3pDiscount = pricing.discounts?.find((d) => d.code === "EB3P");
  const ebDate = ebDiscount?.conditions?.before_date;
  const ebDateFormatted = ebDate ? formatDate(ebDate, lang) : "";
  const ebIndividualFee = ebDiscount ? pricing.base_fee - ebDiscount.amount : null;
  const eb3pFee = eb3pDiscount ? pricing.base_fee - eb3pDiscount.amount : null;

  // Success state
  if (submitted) {
    return (
      <div className="bg-card rounded-xl shadow-sm border border-border p-8 text-center space-y-4">
        <div className="text-4xl text-green-600">&#10003;</div>
        <h2 className="text-xl font-bold text-foreground">
          {t("報名成功！", "Application Submitted!", lang)}
        </h2>
        <div className="bg-primary/10 rounded-lg p-4 space-y-2">
          <div className="text-sm text-muted-foreground">
            {t("參考編號", "Reference Code", lang)}
          </div>
          <div className="text-2xl font-mono font-bold text-primary">
            {submitted.reference_code}
          </div>
        </div>
        {submitted.buddy_code && (
          <div className="bg-amber-50 rounded-lg p-4 space-y-2">
            <div className="text-sm text-muted-foreground">
              {t("同行優惠碼", "Buddy Group Code", lang)}
            </div>
            <div className="text-xl font-mono font-bold text-amber-700">
              {submitted.buddy_code}
            </div>
            <div className="text-xs text-muted-foreground">
              {t(
                "請分享此碼給你的朋友，他們報名時輸入即可加入同行優惠",
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
            "再次感謝家長和學生對MathConcept「中學教室」的支持！\u{1F970}",
            "Thank you again for your support to MathConcept Secondary Academy! \u{1F970}",
            lang
          )}
        </p>
        <a
          href="/summer/status"
          className="inline-block mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors"
        >
          {t("查看報名狀態", "Check Status", lang)}
        </a>
      </div>
    );
  }

  const sectionClass =
    "bg-card rounded-xl shadow-sm border border-border p-5 space-y-4";
  const labelClass = "block text-sm font-medium text-foreground mb-1";
  const radioGroupClass = "flex flex-wrap gap-2";
  const radioLabelClass = (selected: boolean) =>
    `cursor-pointer px-3 py-1.5 rounded-lg border text-sm transition-colors ${
      selected
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-card text-foreground border-border hover:border-primary"
    }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Language toggle */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
          className="text-sm text-primary hover:text-primary-hover font-medium"
        >
          {lang === "zh" ? "English" : "中文"}
        </button>
      </div>

      {/* Title */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-foreground">{config.title}</h1>
      </div>

      {/* Introduction block — matches Google Form preamble */}
      <div className={sectionClass}>
        <p className="text-center font-semibold text-foreground">
          {t(
            "\u2728感謝家長和學生對 MathConcept 「中學教室」的支持！\u2728",
            "\u2728 Thank you to all parents and students for your continuous support for MathConcept Secondary Academy! \u2728",
            lang
          )}
        </p>
        <p className="text-sm text-foreground">
          {t(
            "現誠邀有意就讀中學暑期課程的學生家長填寫貴子女最理想的上課時間，以便導師處理留位手續。",
            "To confirm our summer class schedule, we invite you to share your preferred time slot for our upcoming summer course - the Secondary Preparatory Course. This will help us make the necessary arrangement for reserving your seat.",
            lang
          )}
        </p>
        <div className="text-sm text-foreground space-y-1">
          <div className="font-semibold">
            {t(
              `「\u{1F3D6}\uFE0F暑期中學班」`,
              `\u{1F3D6}\uFE0FSecondary Course`,
              lang
            )}
          </div>
          <div>
            {t(
              `\u{1F970} 教學對象：升 F1 至 升 F3 （中／英文部／國際學校）學生`,
              `\u{1F970} Grades: Pre-F1 to Pre-F3 (Chinese/ English/ International School) students`,
              lang
            )}
          </div>
          <div>
            {t(
              `\u{1F4C6} 課程日期： ${formatDate(config.course_start_date, lang)} 到 ${formatDate(config.course_end_date, lang)}`,
              `\u{1F4C6} Course dates: ${formatDate(config.course_start_date, lang)} - ${formatDate(config.course_end_date, lang)}`,
              lang
            )}
          </div>
          <div>
            {t(
              `\u23F0 課堂安排：每週1堂，每堂90分鐘`,
              `\u23F0 Course schedule: 1 class per week, 90 minutes per class`,
              lang
            )}
          </div>
          <div>
            {t(
              `\u{1F4B0} 課程收費：$${pricing.base_fee}/${config.total_lessons}堂`,
              `\u{1F4B0} Course fees: $${pricing.base_fee} for ${config.total_lessons} lessons`,
              lang
            )}
          </div>
          {ebDiscount && (
            <>
              <div>
                {t(
                  `\u{1F4B0} ${config.year} 暑期優惠：`,
                  `\u{1F4B0} ${config.year} Promotion:`,
                  lang
                )}
              </div>
              <div>
                {t(
                  `\u{1F54A}早鳥優惠 ${ebDateFormatted}前：三人同行報讀$${eb3pFee}；單人$${ebIndividualFee}`,
                  `\u{1F54A} Early Bird Discount Before ${ebDateFormatted}: For 3 accompany discount, the fee is $${eb3pFee} per person; for individual, the fee is $${ebIndividualFee}`,
                  lang
                )}
              </div>
              <div>
                {t(
                  `\u{1F516}9月常規課程禮券`,
                  `\u{1F516} September Regular Course Coupon`,
                  lang
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 1. Student Info */}
      <div className={sectionClass}>
        <div>
          <label className={labelClass}>
            {t(
              "\u{1F58D}\uFE0F 學生英文姓名 (e.g. Bobby MC) ：",
              "\u{1F58D}\uFE0F English name of the student: (e.g. Bobby MC)",
              lang
            )}
          </label>
          <input
            type="text"
            required
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>
            {t(
              "\u{1F58D}\uFE0F 學生就讀學校：",
              "\u{1F58D}\uFE0F Current school:",
              lang
            )}
          </label>
          <input
            type="text"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>
            {t(
              `\u{1F58D}\uFE0F ${config.year}年9月份的就讀年級：`,
              `\u{1F58D}\uFE0F Grade in September ${config.year}:`,
              lang
            )}
          </label>
          <div className={radioGroupClass}>
            {config.available_grades.map((g) => {
              const value = g.value || g.name_en;
              const label = lang === "zh" ? g.name : g.name_en;
              return (
                <label key={value} className={radioLabelClass(grade === value)}>
                  <input
                    type="radio"
                    name="grade"
                    value={value}
                    checked={grade === value}
                    onChange={() => setGrade(value)}
                    className="sr-only"
                    required
                  />
                  {label}
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <label className={labelClass}>
            {t("教學語言", "Language Stream", lang)}
          </label>
          <div className={radioGroupClass}>
            {["CMI", "EMI"].map((s) => (
              <label key={s} className={radioLabelClass(langStream === s)}>
                <input
                  type="radio"
                  name="langStream"
                  value={s}
                  checked={langStream === s}
                  onChange={() => setLangStream(s)}
                  className="sr-only"
                />
                {s}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Existing Student */}
      {config.existing_student_options &&
        config.existing_student_options.length > 0 && (
          <div className={sectionClass}>
            <h2 className="font-semibold text-foreground">
              {t(
                "\u{1F58D}\uFE0F 學生是否現正就讀於MathConcept旗下教育中心？",
                "\u{1F58D}\uFE0FAre you currently a MathConcept's student?",
                lang
              )}
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
                        setIsExistingStudent(value);
                        if (value === "None") setCurrentCenters([]);
                      }}
                      className="sr-only"
                    />
                    {label}
                  </label>
                );
              })}
            </div>

            {/* Center selection (conditional) */}
            {isExistingStudent &&
              isExistingStudent !== "None" &&
              config.center_options &&
              config.center_options.length > 0 && (
                <div>
                  <label className={labelClass}>
                    {t(
                      "\u{1F58D}\uFE0F 如閣下是現有學生，請選擇就讀中的分校。",
                      "\u{1F58D}\uFE0F If you are a current student, please select the center you are attending.",
                      lang
                    )}
                  </label>
                  <div className="space-y-2">
                    {config.center_options.map((c) => {
                      const name = lang === "zh" ? c.name : c.name_en;
                      const checked = currentCenters.includes(c.name);
                      return (
                        <label
                          key={c.name}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setCurrentCenters((prev) =>
                                checked
                                  ? prev.filter((x) => x !== c.name)
                                  : [...prev, c.name]
                              )
                            }
                            className="rounded border-border"
                          />
                          {name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
          </div>
        )}

      {/* 3. Branch selection */}
      <div className={sectionClass}>
        <h2 className="font-semibold text-foreground">
          {t(
            "MathConcept「中學教室」分別設有2間分校，請家長選擇理想分校\u{1F60A}",
            "MathConcept Secondary Academy has 2 branches respectively, please choose below \u{1F60A}:",
            lang
          )}
        </h2>
        <div className="space-y-3">
          {config.locations.map((loc) => {
            const name = lang === "zh" ? loc.name : loc.name_en;
            const addr = lang === "zh" ? loc.address : loc.address_en || loc.address;
            const daysLabel = lang === "zh"
              ? loc.open_days_label || loc.open_days.map((d) => dayLabel(d, lang)).join(", ")
              : loc.open_days_label_en || loc.open_days.map((d) => dayLabel(d, lang)).join(", ");
            const selected = selectedLocation === loc.name;
            return (
              <label
                key={loc.name}
                className={`block cursor-pointer rounded-lg border p-3 transition-colors ${
                  selected
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "border-border hover:border-primary"
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
                    setPref2Day("");
                  }}
                  className="sr-only"
                  required
                />
                <div className="font-medium text-sm">
                  {"\u{1F4CD}"} {name} ({daysLabel})
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{addr}</div>
              </label>
            );
          })}
        </div>
      </div>

      {/* 4. Preferences */}
      {selectedLocation && (
        <div className={sectionClass}>
          {/* 1st preference */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-primary">
              {t(
                "\u{1F4E2} 請家長選擇第一理想上課日子和時間。",
                "\u{1F4E2} Please select your first priority of day and time.",
                lang
              )}
            </div>
            <div>
              <label className={labelClass}>
                {t(
                  "\u{1F4C5} 請家長選擇第一理想的上課日子：",
                  "\u{1F4C5} Please select your first priority of day:",
                  lang
                )}
              </label>
              <div className={radioGroupClass}>
                {openDays.map((d) => (
                  <label key={d} className={radioLabelClass(pref1Day === d)}>
                    <input
                      type="radio"
                      name="pref1Day"
                      value={d}
                      checked={pref1Day === d}
                      onChange={() => setPref1Day(d)}
                      className="sr-only"
                    />
                    {dayLabel(d, lang)}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>
                {t(
                  "\u{1F552} 請家長選擇第一理想的上課時間：",
                  "\u{1F552} Please select your first priority of time:",
                  lang
                )}
              </label>
              <div className={radioGroupClass}>
                {config.time_slots.map((ts) => (
                  <label key={ts} className={radioLabelClass(pref1Time === ts)}>
                    <input
                      type="radio"
                      name="pref1Time"
                      value={ts}
                      checked={pref1Time === ts}
                      onChange={() => setPref1Time(ts)}
                      className="sr-only"
                    />
                    {ts}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* 2nd preference */}
          <div className="space-y-2 pt-3 border-t border-border-subtle">
            <div className="text-sm font-medium text-muted-foreground">
              {t(
                "\u{1F4E2} 請家長選擇第二理想上課日子和時間。",
                "\u{1F4E2} Please select your second priority of day and time.",
                lang
              )}
            </div>
            <div>
              <label className={labelClass}>
                {t(
                  "\u{1F4C5} 請家長選擇第二理想的上課日子：",
                  "\u{1F4C5} Please select your second priority of day:",
                  lang
                )}
              </label>
              <div className={radioGroupClass}>
                {openDays.map((d) => (
                  <label key={d} className={radioLabelClass(pref2Day === d)}>
                    <input
                      type="radio"
                      name="pref2Day"
                      value={d}
                      checked={pref2Day === d}
                      onChange={() => setPref2Day(d)}
                      className="sr-only"
                    />
                    {dayLabel(d, lang)}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>
                {t(
                  "\u{1F552} 請家長選擇第二理想的上課時間：",
                  "\u{1F552} Please select your second priority of time:",
                  lang
                )}
              </label>
              <div className={radioGroupClass}>
                {config.time_slots.map((ts) => (
                  <label key={ts} className={radioLabelClass(pref2Time === ts)}>
                    <input
                      type="radio"
                      name="pref2Time"
                      value={ts}
                      checked={pref2Time === ts}
                      onChange={() => setPref2Time(ts)}
                      className="sr-only"
                    />
                    {ts}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Unavailability */}
      <div className={sectionClass}>
        <label className="block text-sm font-medium text-foreground">
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

      {/* 6. Contact */}
      <div className={sectionClass}>
        <div>
          <label className={labelClass}>
            {t(
              "\u{1F4F2} 我們會在微信給您發放上課的信息，請提供微信號。",
              "\u{1F4F2} We will send you the class information via WeChat. Please provide your WeChat ID.",
              lang
            )}
          </label>
          <input
            type="text"
            required
            value={wechatId}
            onChange={(e) => setWechatId(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>
            {t(
              "\u{1F4DE} 請留下聯絡電話，以便我們和您聯絡！",
              "\u{1F4DE} Please also kindly leave your contact number.",
              lang
            )}
          </label>
          <input
            type="tel"
            required
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* 7. Buddy Group */}
      <div className={sectionClass}>
        <h2 className="font-semibold text-foreground">
          {t("同行優惠", "Buddy Group Discount", lang)}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t(
            "三人或以上同行報名可享團報優惠。你可以輸入同行碼加入已有的小組，或建立新的同行碼分享給朋友。",
            "Groups of 3 or more get a group discount. Enter a buddy code to join an existing group, or create a new code to share with friends.",
            lang
          )}
        </p>

        <div className="space-y-3">
          <div className={radioGroupClass}>
            <label className={radioLabelClass(buddyMode === "none")}>
              <input
                type="radio"
                name="buddyMode"
                checked={buddyMode === "none"}
                onChange={() => setBuddyMode("none")}
                className="sr-only"
              />
              {t("不需要", "Skip", lang)}
            </label>
            <label className={radioLabelClass(buddyMode === "code")}>
              <input
                type="radio"
                name="buddyMode"
                checked={buddyMode === "code"}
                onChange={() => setBuddyMode("code")}
                className="sr-only"
              />
              {t("輸入同行碼", "Enter Buddy Code", lang)}
            </label>
            <label className={radioLabelClass(buddyMode === "names")}>
              <input
                type="radio"
                name="buddyMode"
                checked={buddyMode === "names"}
                onChange={() => setBuddyMode("names")}
                className="sr-only"
              />
              {t("填寫朋友姓名", "Enter Friends' Names", lang)}
            </label>
          </div>

          {buddyMode === "code" && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={buddyCode}
                  onChange={(e) => {
                    setBuddyCode(e.target.value.toUpperCase());
                    setBuddyCodeValid(null);
                  }}
                  className={`${inputClass} flex-1`}
                  placeholder="BG-XXXX"
                />
                <button
                  type="button"
                  onClick={() => validateBuddyCode(buddyCode)}
                  className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded-lg hover:bg-muted transition-colors"
                >
                  {t("驗證", "Verify", lang)}
                </button>
              </div>
              {buddyCodeValid === true && (
                <div className="text-xs text-green-600">
                  {t(
                    `同行碼有效（目前 ${buddyMemberCount} 人已加入）`,
                    `Valid code (${buddyMemberCount} member(s) joined)`,
                    lang
                  )}
                </div>
              )}
              {buddyCodeValid === false && (
                <div className="text-xs text-red-600">
                  {t("同行碼無效", "Invalid buddy code", lang)}
                </div>
              )}
              <div className="text-center text-xs text-muted-foreground">
                {t("或", "or", lang)}
              </div>
              <button
                type="button"
                onClick={handleCreateBuddyGroup}
                className="w-full py-2 text-sm border border-dashed border-primary text-primary rounded-lg hover:bg-primary/10 transition-colors"
              >
                {t("建立新的同行碼", "Create a New Buddy Code", lang)}
              </button>
            </div>
          )}

          {buddyMode === "names" && (
            <div>
              <label className={labelClass}>
                {t("朋友姓名", "Friends' Names", lang)}
              </label>
              <textarea
                value={buddyNames}
                onChange={(e) => setBuddyNames(e.target.value)}
                rows={2}
                className={inputClass}
                placeholder={t(
                  "請填寫你同行朋友的英文姓名",
                  "Enter your friends' English names",
                  lang
                )}
              />
            </div>
          )}
        </div>
      </div>

      {/* 8. Confirmation / Disclaimer */}
      <div className={sectionClass}>
        <p className="text-sm text-foreground">
          {t(
            "\u{1F4E3}\u{1F4E3}此表單僅用於收集學生的理想上課時間，正式開班時間將根據多數學生的選擇而定，如我們未能配合您所選擇之時段，敬希見諒！（暑期班之上課時間將於5月21日或之前確定。）",
            "\u{1F4E3}\u{1F4E3} This form is intended solely for collecting students\u2019 preferences for summer course time slots. Class schedules will be arranged based on the time slots chosen by the majority of students. We apologise for any inconvenience if your preferred time slot is not available. (The schedule for summer course will be confirmed on or before May 21.)",
            lang
          )}
        </p>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 rounded border-border"
            required
          />
          <span className="text-sm font-medium text-foreground">
            {t("確認\u2705\uFE0F", "Confirmed\u2705\uFE0F", lang)}
          </span>
        </label>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || !confirmed}
        className="w-full py-3 rounded-xl font-semibold text-primary-foreground bg-primary hover:bg-primary-hover disabled:bg-muted disabled:cursor-not-allowed transition-colors"
      >
        {submitting
          ? t("提交中...", "Submitting...", lang)
          : t("提交報名", "Submit Application", lang)}
      </button>
    </form>
  );
}
