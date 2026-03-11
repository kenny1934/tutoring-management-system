import Image from "next/image";
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
}: StudentInfoStepProps) {
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
            "MathConcept 中學教室 暑期中學班 7月5日正式開課",
            "MathConcept Secondary Academy Summer Class Starting on 5th July",
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
        <h1 className="text-2xl font-bold text-foreground">{config.title}</h1>
      </div>

      {/* Introduction block */}
      <div className="bg-primary/5 rounded-2xl border border-primary/20 p-6 sm:p-8 space-y-3">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
          {t(
            config.text_content?.intro_zh || "\u2728感謝家長和學生對 MathConcept 「中學教室」的支持！\u2728\n\n現誠邀有意就讀中學暑期課程的學生家長填寫貴子女最理想的上課時間，以便導師處理留位手續。",
            config.text_content?.intro_en || "\u2728 Thank you to all parents and students for your continuous support for MathConcept Secondary Academy! \u2728\n\nTo confirm our summer class schedule, we invite you to share your preferred time slot for our upcoming summer course - the Secondary Preparatory Course. This will help us make the necessary arrangement for reserving your seat.",
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
                  `\u{1F54A}早鳥優惠 ${ebDateFormatted}前 ：三人同行報讀，每人學費 $${eb3pFee}；單人報讀，學費 $${ebIndividualFee}`,
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
              <div>
                {t(
                  "MathConcept現讀生及全新生報讀即可獲贈",
                  "MathConcept current and new students will receive coupon when enrolling",
                  lang
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Student Info Fields */}
      <div className={sectionClass}>
        <div>
          <label className={labelClass}>
            {t(
              "\u{1F58D}\uFE0F 學生英文姓名 (e.g. Bobby MC) ：",
              "\u{1F58D}\uFE0F English name of the student: (e.g. Bobby MC)",
              lang
            )}
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
            {t(
              "\u{1F58D}\uFE0F 學生就讀學校：",
              "\u{1F58D}\uFE0F Current school:",
              lang
            )}
            <RequiredMark />
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
