import Image from "next/image";
import {
  GraduationCap,
  Calendar,
  Clock,
  DollarSign,
  Bird,
  Ticket,
  PenLine,
} from "lucide-react";
import type { SummerCourseFormConfig } from "@/types";
import {
  type Lang,
  t,
  formatDate,
  inputClass,
  sectionClass,
  labelClass,
  radioGroupClass,
  radioLabelClass,
  RadioCheck,
  RequiredMark,
  IconLabel,
} from "@/lib/summer-utils";

interface StudentInfoStepProps {
  config: SummerCourseFormConfig;
  lang: Lang;
  studentName: string;
  setStudentName: (v: string) => void;
  school: string;
  setSchool: (v: string) => void;
  grade: string;
  setGrade: (v: string) => void;
  langStream: string;
  setLangStream: (v: string) => void;
}

export function StudentInfoStep({
  config,
  lang,
  studentName,
  setStudentName,
  school,
  setSchool,
  grade,
  setGrade,
  langStream,
  setLangStream,
}: StudentInfoStepProps) {
  const hasLangStream = !!(config.lang_stream_options && config.lang_stream_options.length > 0);
  const pricing = config.pricing_config;
  const ebDiscount = pricing.discounts?.find((d) => d.code === "EB");
  const eb3pDiscount = pricing.discounts?.find((d) => d.code === "EB3P");
  const ebDate = ebDiscount?.conditions?.before_date;
  const ebDateFormatted = ebDate ? formatDate(ebDate, lang) : "";
  const ebIndividualFee = ebDiscount
    ? pricing.base_fee - ebDiscount.amount
    : null;
  const eb3pFee = eb3pDiscount
    ? pricing.base_fee - eb3pDiscount.amount
    : null;

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="rounded-2xl overflow-hidden">
        <Image
          src={config.banner_image_url || "/summer/summer-banner.jpg"}
          alt={t(
            "MathConcept 中學教室 暑期中學班",
            "MathConcept Secondary Academy Summer Class",
            lang
          )}
          width={6667}
          height={1663}
          className="w-full h-auto"
          priority
        />
      </div>

      {/* Title */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">
          {t(
            config.text_content?.title_zh || config.title,
            config.text_content?.title_en || config.title,
            lang
          )}
        </h1>
      </div>

      {/* Welcome */}
      <div className="bg-primary/5 rounded-2xl border border-primary/20 p-6 sm:p-8">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
          {t(
            config.text_content?.intro_zh || "感謝家長和學生對 MathConcept 「中學教室」的支持！\n\n現誠邀有意就讀中學暑期課程的學生家長填寫貴子女最理想的上課時間，以便導師處理留位手續。",
            config.text_content?.intro_en || "Thank you for your continued support of MathConcept Secondary Academy!\n\nPlease share your preferred class time for our upcoming summer course so we can arrange your schedule.",
            lang
          )}
        </p>
      </div>

      {/* Course Facts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex items-start gap-3 rounded-xl bg-card border border-border p-4">
          <GraduationCap className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
          <div>
            <div className="text-xs font-medium text-muted-foreground">
              {t("教學對象", "Grades", lang)}
            </div>
            <div className="text-sm font-semibold text-foreground mt-0.5">
              {t(
                config.text_content?.target_grades_zh || "升F1 至 升F3（中／英文部／國際學校）",
                config.text_content?.target_grades_en || "Pre-F1 to Pre-F3 (Chinese-medium / English-medium / International)",
                lang
              )}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-card border border-border p-4">
          <Calendar className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
          <div>
            <div className="text-xs font-medium text-muted-foreground">
              {t("課程日期", "Course Dates", lang)}
            </div>
            <div className="text-sm font-semibold text-foreground mt-0.5">
              {formatDate(config.course_start_date, lang)}
              {" — "}
              {formatDate(config.course_end_date, lang)}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-card border border-border p-4">
          <Clock className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
          <div>
            <div className="text-xs font-medium text-muted-foreground">
              {t("課堂安排", "Schedule", lang)}
            </div>
            <div className="text-sm font-semibold text-foreground mt-0.5">
              {t(
                config.text_content?.schedule_format_zh || `共${config.total_lessons}堂 · 每週1堂 · 90分鐘/堂`,
                config.text_content?.schedule_format_en || `${config.total_lessons} lessons · 1 class/week · 90 min each`,
                lang
              )}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-card border border-border p-4">
          <DollarSign className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
          <div>
            <div className="text-xs font-medium text-muted-foreground">
              {t("課程收費", "Course Fee", lang)}
            </div>
            <div className="text-sm font-semibold text-foreground mt-0.5">
              ${pricing.base_fee.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Promotion Callout */}
      {ebDiscount && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Bird className="h-5 w-5 text-amber-600" />
            <span className="text-sm font-bold text-amber-800">
              {t(
                `${config.year} 暑期優惠`,
                `${config.year} Special Offer`,
                lang
              )}
            </span>
          </div>
          <div className="text-sm text-amber-900">
            <p className="font-semibold">
              {t(
                `早鳥優惠（${ebDateFormatted}前報名）`,
                `Early Bird Offer (enrol before ${ebDateFormatted})`,
                lang
              )}
            </p>
            <ul className="mt-1.5 space-y-1 list-disc list-inside">
              <li>
                {t(
                  `三人同行：每人 $${eb3pFee?.toLocaleString()}`,
                  `Group of 3+: $${eb3pFee?.toLocaleString()} per person`,
                  lang
                )}
              </li>
              <li>
                {t(
                  `單人報讀：$${ebIndividualFee?.toLocaleString()}`,
                  `Individual: $${ebIndividualFee?.toLocaleString()}`,
                  lang
                )}
              </li>
            </ul>
          </div>
          <div className="flex items-start gap-2 text-sm text-amber-800">
            <Ticket className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              {t(
                "9月常規課程禮券 — MathConcept現讀生及全新生報讀即可獲贈",
                "September Regular Course Coupon — available to all MathConcept current and new students upon enrolment",
                lang
              )}
            </span>
          </div>
        </div>
      )}

      {/* Student Info Fields */}
      <div className={sectionClass}>
        <div>
          <label className={labelClass}>
            <IconLabel icon={PenLine}>
              {t(
                "學生英文姓名 (e.g. Bobby MC)：",
                "English name of the student: (e.g. Bobby MC)",
                lang
              )}
            </IconLabel>
            <RequiredMark />
          </label>
          <input
            type="text"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>
            <IconLabel icon={PenLine}>
              {t("學生就讀學校：", "Current school:", lang)}
            </IconLabel>
            <RequiredMark />
          </label>
          {hasLangStream ? (
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                className={`${inputClass} flex-1`}
              />
              <div className="flex gap-1 shrink-0">
                {config.lang_stream_options!.map((opt, idx) => {
                  const value = opt.value || opt.name_en;
                  const label = lang === "zh" ? opt.name : opt.name_en;
                  const selected = langStream === value;
                  return (
                    <label
                      key={value || idx}
                      className={`cursor-pointer inline-flex items-center justify-center px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                        selected
                          ? "bg-primary/10 text-primary border-primary shadow-sm"
                          : "bg-card text-foreground border-border hover:border-primary/50 hover:bg-primary/5"
                      }`}
                    >
                      <input
                        type="radio"
                        name="langStream"
                        value={value}
                        checked={selected}
                        onChange={() => setLangStream(value)}
                        className="sr-only"
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <input
              type="text"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              className={inputClass}
            />
          )}
        </div>

        <div>
          <label className={labelClass}>
            <IconLabel icon={PenLine}>
              {t(
                `${config.year}年9月份的就讀年級：`,
                `Grade in September ${config.year}:`,
                lang
              )}
            </IconLabel>
            <RequiredMark />
          </label>
          <div className={radioGroupClass}>
            {config.available_grades.map((g) => {
              const value = g.value || g.name_en;
              const label = lang === "zh" ? g.name : g.name_en;
              return (
                <label
                  key={value}
                  className={radioLabelClass(grade === value)}
                >
                  <input
                    type="radio"
                    name="grade"
                    value={value}
                    checked={grade === value}
                    onChange={() => setGrade(value)}
                    className="sr-only"
                  />
                  {grade === value && <RadioCheck />}
                  {label}
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
