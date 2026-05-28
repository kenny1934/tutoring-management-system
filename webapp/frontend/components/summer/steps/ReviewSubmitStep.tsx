import { Info } from "lucide-react";
import type { SummerCourseFormConfig } from "@/types";
import { type Lang, t, dayLabel, frequencyLabel, sectionClass, shortCenterName } from "@/lib/summer-utils";
import { classifyPrefs, type PrefSlot } from "@/lib/summer-preferences";

/** Today's local date as YYYY-MM-DD, for lexicographic comparison with config dates. */
function todayISO(): string {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

/** Parse a YYYY-MM-DD string at local midnight (avoids UTC off-by-one). */
function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

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
  langStream: string;
  isExistingStudent: string;
  currentCenters: string[];
  selectedLocation: string;
  sessionsPerWeek: number;
  pref1Day: string;
  pref1Time: string;
  pref2Day: string;
  pref2Time: string;
  pref3Day: string;
  pref3Time: string;
  pref4Day: string;
  pref4Time: string;
  unavailability: string;
  wechatId: string;
  contactPhone: string;
  buddyMode: "none" | "code";
  buddyCode: string;
  buddyReferrerName: string;
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
}

export function ReviewSubmitStep({
  config,
  lang,
  studentName,
  school,
  grade,
  langStream,
  isExistingStudent,
  currentCenters,
  selectedLocation,
  sessionsPerWeek,
  pref1Day,
  pref1Time,
  pref2Day,
  pref2Time,
  pref3Day,
  pref3Time,
  pref4Day,
  pref4Time,
  unavailability,
  wechatId,
  contactPhone,
  buddyMode,
  buddyCode,
  buddyReferrerName,
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

  const langStreamData = config.lang_stream_options?.find(
    (o) => (o.value || o.name_en) === langStream
  );
  const langStreamLabel = langStreamData
    ? lang === "zh"
      ? langStreamData.name
      : langStreamData.name_en
    : langStream;

  // Disclaimer = a date-aware "when we'll confirm" line + an evergreen note on
  // scheduling. The contact-by date is shown only while it's still upcoming;
  // once it passes (or is unset) we drop it, so a stale past date never reads as
  // "your application is already settled". The scheduling note stays editable in
  // config (text_content.disclaimer_*); the date lives in contact_by_date.
  const contactBy = config.text_content?.contact_by_date?.trim();
  const showContactDate =
    !!contactBy && /^\d{4}-\d{2}-\d{2}$/.test(contactBy) && contactBy >= todayISO();
  const contactDate = showContactDate ? parseISODate(contactBy!) : null;

  const scheduleNoteZh =
    config.text_content?.disclaimer_zh || "實際時段會根據整體報名情況安排及調整。";
  const scheduleNoteEn =
    config.text_content?.disclaimer_en ||
    "Actual schedules will be arranged and adjusted based on overall demand.";

  const disclaimerZh =
    (contactDate
      ? `我們會在${contactDate.getMonth() + 1}月${contactDate.getDate()}日或之前聯絡您確認上課時間，`
      : "我們會盡快聯絡您確認上課時間，") + scheduleNoteZh;
  const disclaimerEn =
    (contactDate
      ? `We will contact you on or before ${contactDate.toLocaleDateString("en-GB", { day: "numeric", month: "long" })} to confirm class times. `
      : "We will contact you shortly to confirm class times. ") + scheduleNoteEn;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className={sectionClass}>
        <h2 className="text-base font-semibold text-foreground leading-snug">
          {t("報名資料預覽", "Application Summary", lang)}
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed mt-1">
          {t(
            "請核對以下資料，確認無誤後按「提交報名」遞交。",
            "Please review the details below. When everything is correct, press “Submit Application” to submit.",
            lang
          )}
        </p>
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
          {langStream && (
            <SummaryRow
              label={t("教學語言", "Language Stream", lang)}
              value={langStreamLabel}
            />
          )}
          <SummaryRow
            label={t("現有學生", "Existing Student", lang)}
            value={(() => {
              const opt = config.existing_student_options?.find(
                (o) => (o.value || o.name_en) === isExistingStudent
              );
              if (!opt) return isExistingStudent;
              return lang === "zh" ? opt.name : opt.name_en;
            })()}
          />
          {currentCenters.length > 0 && (
            <SummaryRow
              label={t("就讀分校", "Current Center(s)", lang)}
              value={currentCenters
                .map((c) => {
                  const opt = config.center_options?.find(
                    (o) => o.name === c
                  );
                  if (!opt) return c;
                  const name = lang === "zh" ? opt.name : opt.name_en;
                  return shortCenterName(name);
                })
                .join(", ")}
            />
          )}
          <SummaryRow
            label={t("分校", "Branch", lang)}
            value={locationLabel}
          />
          <SummaryRow
            label={t("每星期上課次數", "Lessons per week", lang)}
            value={frequencyLabel(sessionsPerWeek, lang)}
          />
          {(() => {
            const { isPair, primary, backup } = classifyPrefs({
              sessions_per_week: sessionsPerWeek,
              preference_1_day: pref1Day, preference_1_time: pref1Time,
              preference_2_day: pref2Day, preference_2_time: pref2Time,
              preference_3_day: pref3Day, preference_3_time: pref3Time,
              preference_4_day: pref4Day, preference_4_time: pref4Time,
            });
            const fmt = (s: PrefSlot | undefined) =>
              s ? `${dayLabel(s.day, lang)} ${s.time}` : "";
            const rows = isPair
              ? [
                  { zh: "主要時段 1", en: "Primary slot 1", s: primary[0] },
                  { zh: "主要時段 2", en: "Primary slot 2", s: primary[1] },
                  { zh: "後備時段 1", en: "Backup slot 1", s: backup[0] },
                  { zh: "後備時段 2", en: "Backup slot 2", s: backup[1] },
                ]
              : [
                  { zh: "主要時段", en: "Main slot", s: primary[0] },
                  { zh: "後備時段", en: "Backup slot", s: backup[0] },
                ];
            return rows.map((r) => (
              <SummaryRow key={r.en} label={t(r.zh, r.en, lang)} value={fmt(r.s)} />
            ));
          })()}
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
            <>
              <SummaryRow
                label={t("同行碼", "Buddy Code", lang)}
                value={buddyCode}
              />
              {buddyReferrerName && (
                <SummaryRow
                  label={t("同行朋友姓名", "Buddy Referrer", lang)}
                  value={buddyReferrerName}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Disclaimer + confirmation */}
      <div className={sectionClass}>
        <div className="flex items-start gap-2.5 rounded-lg bg-primary/5 border border-primary/15 px-3.5 py-2.5">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary/70" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t(disclaimerZh, disclaimerEn, lang)}
          </p>
        </div>
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
            {t("本人確認以上資料正確無誤", "I confirm the information above is correct", lang)}
          </span>
        </label>
      </div>
    </div>
  );
}
