import Image from "next/image";
import {
  Sun,
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
  InfoRow,
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
        <h1 className="text-2xl font-bold text-foreground">{config.title}</h1>
      </div>

      {/* Introduction block */}
      <div className="bg-primary/5 rounded-2xl border border-primary/20 p-6 sm:p-8 space-y-4">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
          {t(
            config.text_content?.intro_zh || "感謝家長和學生對 MathConcept 「中學教室」的支持！\n\n現誠邀有意就讀中學暑期課程的學生家長填寫貴子女最理想的上課時間，以便導師處理留位手續。",
            config.text_content?.intro_en || "Thank you to all parents and students for your continuous support for MathConcept Secondary Academy!\n\nTo confirm our summer class schedule, we invite you to share your preferred time slot for our upcoming summer course - the Secondary Preparatory Course. This will help us make the necessary arrangement for reserving your seat.",
            lang
          )}
        </p>
        <div className="space-y-2">
          <InfoRow icon={Sun}>
            <span className="font-semibold">
              {t("暑期中學班", "Secondary Course", lang)}
            </span>
          </InfoRow>
          <InfoRow icon={GraduationCap}>
            {t(
              "教學對象：升 F1 至 升 F3 （中／英文部／國際學校）學生",
              "Grades: Pre-F1 to Pre-F3 (Chinese / English / International School) students",
              lang
            )}
          </InfoRow>
          <InfoRow icon={Calendar}>
            {t(
              `課程日期：${formatDate(config.course_start_date, lang)} 到 ${formatDate(config.course_end_date, lang)}`,
              `Course dates: ${formatDate(config.course_start_date, lang)} - ${formatDate(config.course_end_date, lang)}`,
              lang
            )}
          </InfoRow>
          <InfoRow icon={Clock}>
            {t(
              "課堂安排：每週1堂，每堂90分鐘",
              "Course schedule: 1 class per week, 90 minutes per class",
              lang
            )}
          </InfoRow>
          <InfoRow icon={DollarSign}>
            {t(
              `課程收費：$${pricing.base_fee}/${config.total_lessons}堂`,
              `Course fees: $${pricing.base_fee} for ${config.total_lessons} lessons`,
              lang
            )}
          </InfoRow>
          {ebDiscount && (
            <>
              <InfoRow icon={DollarSign}>
                {t(
                  `${config.year} 暑期優惠：`,
                  `${config.year} Promotion:`,
                  lang
                )}
              </InfoRow>
              <InfoRow icon={Bird}>
                {t(
                  `早鳥優惠 ${ebDateFormatted}前：三人同行報讀，每人學費 $${eb3pFee}；單人報讀，學費 $${ebIndividualFee}`,
                  `Early Bird Discount Before ${ebDateFormatted}: For 3 accompany discount, the fee is $${eb3pFee} per person; for individual, the fee is $${ebIndividualFee}`,
                  lang
                )}
              </InfoRow>
              <InfoRow icon={Ticket}>
                {t(
                  "9月常規課程禮券 — MathConcept現讀生及全新生報讀即可獲贈",
                  "September Regular Course Coupon — MathConcept current and new students will receive coupon when enrolling",
                  lang
                )}
              </InfoRow>
            </>
          )}
        </div>
      </div>

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
          <input
            type="text"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            className={inputClass}
          />
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
