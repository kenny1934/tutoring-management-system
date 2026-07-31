import { Phone, Info } from "lucide-react";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";
import type { RegularCourseFormConfig } from "@/types";
import {
  type Lang,
  t,
  dayLabel,
  inputClass,
  sectionClass,
  labelClass,
  IconLabel,
  shortCenterName,
} from "@/lib/regular-utils";
import {
  getActiveRegularPromo,
  intakeChargesRegistrationFee,
  promoName,
  promoPricing,
} from "@/lib/regular-promo";

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

interface ContactConfirmStepProps {
  config: RegularCourseFormConfig;
  lang: Lang;
  wechatId: string;
  setWechatId: (v: string) => void;
  contactPhone: string;
  setContactPhone: (v: string) => void;
  studentName: string;
  school: string;
  grade: string;
  langStream: string;
  isExistingStudent: string;
  currentCenters: string[];
  selectedLocation: string;
  pref1Day: string;
  pref1Time: string;
  pref2Day: string;
  pref2Time: string;
  makeupConfirmed: boolean;
  setMakeupConfirmed: (v: boolean) => void;
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
}

export function ContactConfirmStep({
  config,
  lang,
  wechatId,
  setWechatId,
  contactPhone,
  setContactPhone,
  studentName,
  school,
  grade,
  langStream,
  isExistingStudent,
  currentCenters,
  selectedLocation,
  pref1Day,
  pref1Time,
  pref2Day,
  pref2Time,
  makeupConfirmed,
  setMakeupConfirmed,
  confirmed,
  setConfirmed,
}: ContactConfirmStepProps) {
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

  const slotValue = (day: string, time: string) =>
    day && time ? `${dayLabel(day, lang)} ${time}` : "";

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

  const disclaimerZh = contactDate
    ? `我們會在${contactDate.getMonth() + 1}月${contactDate.getDate()}日或之前聯絡您確認上課時間，${scheduleNoteZh}`
    : config.text_content?.disclaimer_zh ||
      "我們會在8月17日或之前根據整體報名情況確認實際上課時間表。";
  const disclaimerEn = contactDate
    ? `We will contact you on or before ${contactDate.toLocaleDateString("en-GB", { day: "numeric", month: "long" })} to confirm class times. ${scheduleNoteEn}`
    : config.text_content?.disclaimer_en ||
      "We will confirm the final timetable on or before 17 August based on overall preferences.";

  // Present only while the offer is running: the API strips it from the public
  // config outside its window, so no date check is needed here.
  const promo = getActiveRegularPromo(config.pricing_config);
  const promoPrice = promo ? promoPricing(config.pricing_config, promo) : null;

  return (
    <div className="space-y-6">
      {/* Contact */}
      <div className={sectionClass}>
        <div>
          <label className={labelClass}>
            <IconLabel icon={WeChatIcon}>
              {t("微信號", "WeChat ID", lang)}
            </IconLabel>
          </label>
          <p className="text-xs text-muted-foreground -mt-1 mb-2 leading-relaxed">
            {t(
              "我們會在微信給您發放上課的訊息，請提供微信號。",
              "We will send class information via WeChat. Please provide your WeChat ID.",
              lang
            )}
          </p>
          <input
            type="text"
            value={wechatId}
            onChange={(e) => setWechatId(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>
            <IconLabel icon={Phone}>
              {t("聯絡電話", "Contact phone", lang)}
            </IconLabel>
          </label>
          <p className="text-xs text-muted-foreground -mt-1 mb-2 leading-relaxed">
            {t(
              "請留下聯絡電話，以便我們和您聯絡。",
              "Please leave a contact phone number so we can reach you.",
              lang
            )}
          </p>
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Summary */}
      <div className={sectionClass}>
        <h2 className="text-base font-semibold text-foreground leading-snug">
          {t("留位意向資料預覽", "Application Summary", lang)}
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed mt-1">
          {t(
            "請核對以下資料，確認無誤後按「提交意向」遞交。",
            "Please review the details below. When everything is correct, press “Submit Application” to submit.",
            lang
          )}
        </p>
        <div className="bg-secondary/50 rounded-xl p-4 space-y-0.5 text-sm">
          {!studentName && !school && !grade && !selectedLocation ? (
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
            label={t("主要時段", "Main slot", lang)}
            value={slotValue(pref1Day, pref1Time)}
          />
          <SummaryRow
            label={t("後備時段", "Backup slot", lang)}
            value={slotValue(pref2Day, pref2Time)}
          />
          {config.pricing_config && (
            <SummaryRow
              label={t("學費", "Fee", lang)}
              value={t(
                `$${config.pricing_config.base_fee.toLocaleString("en-US")}（${config.pricing_config.lessons_per_block}堂）`,
                `$${config.pricing_config.base_fee.toLocaleString("en-US")} (${config.pricing_config.lessons_per_block} lessons)`,
                lang
              )}
            />
          )}
        </div>
        {/* Only when this intake actually collects it. The September intake
            does not, so the line would announce a charge nobody pays. */}
        {config.pricing_config?.registration_fee &&
        intakeChargesRegistrationFee(config.pricing_config) ? (
          <p className="text-xs text-muted-foreground leading-relaxed mt-2">
            {t(
              `新生另收一次性教材費 $${config.pricing_config.registration_fee.toLocaleString("en-US")}。`,
              `New students pay a one-off $${config.pricing_config.registration_fee.toLocaleString("en-US")} materials fee.`,
              lang
            )}
          </p>
        ) : null}
        {/* The offer is repeated here because this is the last screen before
            submitting, and the fee row above quotes the standard price. A new
            student should not have to scroll back to Step 1 to be reminded
            that the number they will be given is lower. */}
        {promo && promoPrice ? (
          <p className="text-xs text-amber-700 dark:text-amber-500 leading-relaxed mt-2">
            {t(
              `合資格新生可享${promoName(promo, lang)}，減免 $${promo.total_value}，首期學費為 $${promoPrice.promoFee.toLocaleString("en-US")}。`,
              `Eligible new students receive the ${promoName(promo, lang)}, a saving of $${promo.total_value}, bringing the first block to $${promoPrice.promoFee.toLocaleString("en-US")}.`,
              lang
            )}
          </p>
        ) : null}
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
            makeupConfirmed
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
        >
          <input
            type="checkbox"
            checked={makeupConfirmed}
            onChange={(e) => setMakeupConfirmed(e.target.checked)}
            className="mt-0.5 rounded border-border accent-primary"
            required
          />
          <span className="text-sm font-medium text-foreground leading-relaxed">
            {t(
              config.text_content?.makeup_note_zh ||
                "為能令課堂安排更完整，如學生於學費期內有事宜不能出席課堂，請提早通知導師，讓導師為您提早安排補堂。",
              config.text_content?.makeup_note_en ||
                "To keep class arrangements complete, if the student cannot attend a lesson within the paid period, please notify the tutor in advance so a make-up lesson can be arranged early.",
              lang
            )}
          </span>
        </label>
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
