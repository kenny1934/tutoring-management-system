import type { SummerCourseFormConfig } from "@/types";
import { type Lang, t, dayLabel, sectionClass } from "@/lib/summer-utils";

function SummaryRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-1.5 border-b border-border-subtle last:border-0 gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

interface ReviewSubmitStepProps {
  config: SummerCourseFormConfig;
  lang: Lang;
  studentName: string;
  school: string;
  grade: string;
  isExistingStudent: string;
  currentCenters: string[];
  selectedLocation: string;
  pref1Day: string;
  pref1Time: string;
  pref2Day: string;
  pref2Time: string;
  unavailability: string;
  wechatId: string;
  contactPhone: string;
  buddyMode: "none" | "code" | "names";
  buddyCode: string;
  buddyNames: string;
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
}

export function ReviewSubmitStep({
  config,
  lang,
  studentName,
  school,
  grade,
  isExistingStudent,
  currentCenters,
  selectedLocation,
  pref1Day,
  pref1Time,
  pref2Day,
  pref2Time,
  unavailability,
  wechatId,
  contactPhone,
  buddyMode,
  buddyCode,
  buddyNames,
  confirmed,
  setConfirmed,
}: ReviewSubmitStepProps) {
  const locationData = config.locations.find(
    (l) => l.name === selectedLocation
  );
  const locationLabel = locationData
    ? lang === "zh"
      ? locationData.name
      : locationData.name_en
    : selectedLocation;

  const gradeData = config.available_grades.find(
    (g) => (g.value || g.name_en) === grade
  );
  const gradeLabel = gradeData
    ? lang === "zh"
      ? gradeData.name
      : gradeData.name_en
    : grade;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className={sectionClass}>
        <h2 className="text-base font-semibold text-foreground leading-snug">
          {t("報名資料確認", "Application Summary", lang)}
        </h2>
        <div className="bg-secondary/50 rounded-xl p-4 space-y-0.5 text-sm">
          {!studentName && !school && !grade && !selectedLocation && !contactPhone ? (
            <p className="text-muted-foreground text-center py-2">
              {t("請先填寫表格以查看摘要", "Please fill in the form to see your summary", lang)}
            </p>
          ) : null}
          <SummaryRow
            label={t("學生姓名", "Student Name", lang)}
            value={studentName}
          />
          <SummaryRow
            label={t("學校", "School", lang)}
            value={school}
          />
          <SummaryRow
            label={t("年級", "Grade", lang)}
            value={gradeLabel}
          />
          <SummaryRow
            label={t("現有學生", "Existing Student", lang)}
            value={isExistingStudent}
          />
          {currentCenters.length > 0 && (
            <SummaryRow
              label={t("就讀分校", "Current Center(s)", lang)}
              value={currentCenters
                .map((c) => {
                  const opt = config.center_options?.find(
                    (o) => o.name === c
                  );
                  return opt
                    ? lang === "zh"
                      ? opt.name
                      : opt.name_en
                    : c;
                })
                .join(", ")}
            />
          )}
          <SummaryRow
            label={t("分校", "Branch", lang)}
            value={locationLabel}
          />
          <SummaryRow
            label={t("第一志願", "1st Preference", lang)}
            value={
              pref1Day && pref1Time
                ? `${dayLabel(pref1Day, lang)} ${pref1Time}`
                : ""
            }
          />
          <SummaryRow
            label={t("第二志願", "2nd Preference", lang)}
            value={
              pref2Day && pref2Time
                ? `${dayLabel(pref2Day, lang)} ${pref2Time}`
                : ""
            }
          />
          <SummaryRow
            label={t("無法上課日期", "Unavailable Dates", lang)}
            value={unavailability}
          />
          <SummaryRow label="WeChat" value={wechatId} />
          <SummaryRow
            label={t("電話", "Phone", lang)}
            value={contactPhone}
          />
          {buddyMode === "code" && buddyCode && (
            <SummaryRow
              label={t("同行碼", "Buddy Code", lang)}
              value={buddyCode}
            />
          )}
          {buddyMode === "names" && buddyNames && (
            <SummaryRow
              label={t("同行朋友", "Buddy Names", lang)}
              value={buddyNames}
            />
          )}
        </div>
      </div>

      {/* Disclaimer + confirmation */}
      <div className={sectionClass}>
        <p className="text-sm text-foreground leading-relaxed">
          {t(
            config.text_content?.disclaimer_zh || "\u{1F4E3}\u{1F4E3}此表單僅用於收集學生的理想上課時間，正式開班時間將根據多數學生的選擇而定，如我們未能配合您所選擇之時段，敬希見諒！（暑期班之上課時間將於5月21日或之前確定。）",
            config.text_content?.disclaimer_en || "\u{1F4E3}\u{1F4E3} This form is intended solely for collecting students\u2019 preferences for summer course time slots. Class schedules will be arranged based on the time slots chosen by the majority of students. We apologise for any inconvenience if your preferred time slot is not available. (The schedule for summer course will be confirmed on or before May 21.)",
            lang
          )}
        </p>
        <label
          className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border-2 transition-all duration-200 ${
            confirmed
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
        >
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 rounded border-border accent-primary"
            required
          />
          <span className="text-sm font-medium text-foreground">
            {t("確認\u2705\uFE0F", "Confirmed\u2705\uFE0F", lang)}
          </span>
        </label>
      </div>
    </div>
  );
}
