import Image from "next/image";
import { GraduationCap, Calendar, Clock, DollarSign, PenLine, Info } from "lucide-react";
import type { RegularCourseFormConfig } from "@/types";
import {
  type Lang,
  t,
  inputClass,
  sectionClass,
  labelClass,
  radioGroupClass,
  radioLabelClass,
  RequiredMark,
  IconLabel,
} from "@/lib/regular-utils";

interface StudentInfoStepProps {
  config: RegularCourseFormConfig;
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

  const intro = config.course_intro;
  const introHeadline = intro?.headline;
  const introPillars = intro?.pillars ?? [];
  const introPhilosophy = intro?.philosophy;
  const hasIntro = !!(introHeadline || introPillars.length > 0 || introPhilosophy);
  const bannerImage = config.banner_image_url;

  const headlineText = t(
    introHeadline?.zh || config.title,
    introHeadline?.en || config.title,
    lang
  );

  return (
    <div className="space-y-6">
      {/* About this course — marketing pitch. Regular has no seasonal pamphlet
          calligraphy by default, so the slogan band is conditional: a config-
          provided banner image when available, otherwise the course headline
          rendered as text on the brand band. This is the focal point of
          Step 1; everything below is a compact utility strip. */}
      {(hasIntro || bannerImage) && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {/* Full-bleed brand band — integrates with the card top edge,
              compact height, with a thin gold accent line at the bottom that
              matches the header treatment. */}
          <div className="relative bg-[#B60D20] h-[72px] sm:h-[80px] overflow-hidden">
            {bannerImage ? (
              <Image
                src={bannerImage}
                alt={headlineText}
                fill
                className="object-cover object-center"
                priority
              />
            ) : (
              <div className="h-full flex items-center justify-center px-4">
                <span
                  className="text-white font-bold text-lg sm:text-xl text-center leading-snug"
                  style={{ textWrap: "balance" }}
                >
                  {headlineText}
                </span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-[#F5C518]/80 to-transparent" />
          </div>

          {(introPillars.length > 0 || introPhilosophy) && (
            <div className="px-5 pt-4 sm:px-8 sm:pt-5 pb-4 sm:pb-5 text-center space-y-3">
              {introPillars.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2 text-sm font-medium text-primary">
                  {introPillars.map((p, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center justify-center text-center leading-snug min-h-[2.5rem] sm:border-l sm:border-primary/20 sm:[&:nth-child(3n+1)]:border-l-0 sm:px-1"
                      style={{ textWrap: "balance" }}
                    >
                      {t(p.zh, p.en, lang)}
                    </span>
                  ))}
                </div>
              )}
              {introPhilosophy && (
                <p
                  className="text-sm sm:text-[15px] text-foreground leading-relaxed whitespace-pre-line max-w-2xl mx-auto"
                  style={{ textWrap: "balance" }}
                >
                  {t(introPhilosophy.zh, introPhilosophy.en, lang)}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Course Facts — compact horizontal strip so the marketing content
          above stays the focal point. Regular has no end date, so this is
          grades, start, schedule, plus a fee cell when pricing is configured. */}
      <div className="rounded-xl bg-card border border-border px-4 py-3 sm:px-5 sm:py-3.5">
        <div
          className={`grid grid-cols-2 gap-3 sm:gap-0 sm:divide-x sm:divide-border ${
            config.pricing_config ? "sm:grid-cols-4" : "sm:grid-cols-3"
          }`}
        >
          <div className="flex items-center gap-2.5 sm:px-4 first:sm:pl-0 last:sm:pr-0">
            <GraduationCap className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground leading-tight">
                {t("對象", "Grades", lang)}
              </div>
              <div className="text-xs font-semibold text-foreground leading-tight mt-0.5 truncate">
                {t(
                  config.text_content?.target_grades_zh || "中一至中三",
                  config.text_content?.target_grades_en || "F1 to F3",
                  lang
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 sm:px-4 first:sm:pl-0 last:sm:pr-0">
            <Calendar className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground leading-tight">
                {t("開課", "Start", lang)}
              </div>
              <div className="text-xs font-semibold text-foreground leading-tight mt-0.5 truncate">
                {t(
                  config.text_content?.start_note_zh || "9月1日當週開課",
                  config.text_content?.start_note_en || "Classes begin the week of 1 September",
                  lang
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 sm:px-4 first:sm:pl-0 last:sm:pr-0">
            <Clock className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground leading-tight">
                {t("課堂", "Schedule", lang)}
              </div>
              <div className="text-xs font-semibold text-foreground leading-tight mt-0.5 truncate">
                {t(
                  config.text_content?.schedule_format_zh || "每星期一堂 · 90分鐘",
                  config.text_content?.schedule_format_en || "Weekly · 90 min",
                  lang
                )}
              </div>
            </div>
          </div>
          {config.pricing_config && (
            <div className="flex items-center gap-2.5 sm:px-4 first:sm:pl-0 last:sm:pr-0">
              <DollarSign className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground leading-tight">
                  {t("學費", "Fee", lang)}
                </div>
                <div className="text-xs font-semibold text-foreground leading-tight mt-0.5 truncate">
                  {t(
                    `$${config.pricing_config.base_fee.toLocaleString("en-US")} / ${config.pricing_config.lessons_per_block}堂`,
                    `$${config.pricing_config.base_fee.toLocaleString("en-US")} / ${config.pricing_config.lessons_per_block} lessons`,
                    lang
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inline notice placed right before the form fields — parents are about
          to act, and this is the moment to remind them the form is just a
          time-slot preference collection, not a formal registration. */}
      <div className="flex items-start gap-2.5 rounded-lg bg-primary/5 border border-primary/15 px-3.5 py-2.5">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary/70" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t(
            config.text_content?.intro_zh || "此表格僅為收集上課時間意向，並非正式報名。導師會於稍後聯絡家長確認留位。",
            config.text_content?.intro_en || "This form only collects your preferred class time. It is not a formal registration. Our team will contact you to confirm enrolment.",
            lang
          )}
        </p>
      </div>

      {/* Student Info Fields */}
      <div className={sectionClass}>
        <div>
          <label className={labelClass}>
            <IconLabel icon={PenLine}>
              {t("學生英文姓名", "Student English name", lang)}
            </IconLabel>
            <RequiredMark />
          </label>
          <input
            type="text"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            className={inputClass}
            placeholder="e.g. Bobby Mc"
          />
        </div>

        <div>
          <label className={labelClass}>
            <IconLabel icon={PenLine}>
              {t("就讀學校", "Current school", lang)}
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
              <div className="flex sm:inline-flex rounded-xl border-2 border-border overflow-hidden shrink-0 sm:self-stretch">
                {config.lang_stream_options!.map((opt, idx) => {
                  const value = opt.value || opt.name_en;
                  const label = lang === "zh" ? opt.name : opt.name_en;
                  const selected = langStream === value;
                  return (
                    <label
                      key={value || idx}
                      className={`cursor-pointer flex-1 sm:flex-initial inline-flex items-center justify-center px-2 py-2.5 sm:px-3 sm:py-0 text-xs font-medium transition-colors duration-150 sm:whitespace-nowrap text-center border-r border-border last:border-r-0 ${
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
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
                `${config.year}年9月份的就讀年級`,
                `Grade in September ${config.year}`,
                lang
              )}
            </IconLabel>
            <RequiredMark />
          </label>
          <div className={radioGroupClass}>
            {config.available_grades.filter((g) => !g.admin_only).map((g) => {
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
