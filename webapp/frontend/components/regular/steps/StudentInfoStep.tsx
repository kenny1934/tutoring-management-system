import Image from "next/image";
import { GraduationCap, Calendar, Clock, DollarSign, PenLine, Info, BadgePercent, Check } from "lucide-react";
import type { RegularCourseFormConfig } from "@/types";
import { getActiveRegularPromo, promoItems, promoName, promoPricing } from "@/lib/regular-promo";
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
import { cn } from "@/lib/utils";

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

  // Facts strip: two columns until there is room to sit on one row. The fee cell
  // makes it four, and four cells only stop crowding around lg, so the one-row
  // breakpoint moves with the cell count. Values wrap rather than truncate, so a
  // long start note stays readable in either language. Class strings are written
  // out in full — Tailwind only sees literals in the source.
  const hasPricing = !!config.pricing_config;
  const factsGridClass = hasPricing
    ? "grid grid-cols-2 gap-x-5 gap-y-3 lg:grid-cols-4 lg:gap-y-0 lg:divide-x lg:divide-border"
    : "grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 sm:gap-y-0 sm:divide-x sm:divide-border";
  const factCellClass = hasPricing
    ? "flex items-start gap-2.5 lg:px-4 lg:first:pl-0 lg:last:pr-0"
    : "flex items-start gap-2.5 sm:px-4 sm:first:pl-0 sm:last:pr-0";

  const intro = config.course_intro;
  const introHeadline = intro?.headline;
  const introPillars = intro?.pillars ?? [];
  const introPhilosophy = intro?.philosophy;
  const hasIntro = !!(introHeadline || introPillars.length > 0 || introPhilosophy);
  const bannerImage = config.banner_image_url;

  // Seasonal offer. No date check here: the API withholds the promo from the
  // public config until its launch day, so anything that arrived is live.
  const promo = getActiveRegularPromo(config.pricing_config);
  const promoPrice = promo ? promoPricing(config.pricing_config, promo) : null;

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
              matches the header treatment.

              A banner is artwork with its own margins, so it is contained
              rather than cropped: the band is wider than the art is tall, and
              object-cover would slice the top and bottom off the lettering.
              The band turns black behind it, which the current banner's own
              background matches exactly, so the letterboxing does not read as
              empty space. */}
          <div
            className={cn(
              "relative overflow-hidden",
              bannerImage
                ? "bg-black h-[88px] sm:h-[112px]"
                : "bg-[#B60D20] h-[72px] sm:h-[80px]"
            )}
          >
            {bannerImage ? (
              <Image
                src={bannerImage}
                alt={headlineText}
                fill
                className="object-contain object-center"
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
        <div className={factsGridClass}>
          <div className={factCellClass}>
            <GraduationCap className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground leading-tight">
                {t("對象", "Grades", lang)}
              </div>
              <div className="text-xs font-semibold text-foreground leading-snug mt-0.5 break-words">
                {t(
                  config.text_content?.target_grades_zh || "中一至中三",
                  config.text_content?.target_grades_en || "F1 to F3",
                  lang
                )}
              </div>
            </div>
          </div>
          <div className={factCellClass}>
            <Calendar className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground leading-tight">
                {t("開課", "Start", lang)}
              </div>
              <div className="text-xs font-semibold text-foreground leading-snug mt-0.5 break-words">
                {t(
                  config.text_content?.start_note_zh || "9月1日當週開課",
                  config.text_content?.start_note_en || "Classes begin the week of 1 September",
                  lang
                )}
              </div>
            </div>
          </div>
          <div className={factCellClass}>
            <Clock className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground leading-tight">
                {t("課堂", "Schedule", lang)}
              </div>
              <div className="text-xs font-semibold text-foreground leading-snug mt-0.5 break-words">
                {t(
                  config.text_content?.schedule_format_zh || "每星期一堂 · 90分鐘",
                  config.text_content?.schedule_format_en || "Weekly · 90 min",
                  lang
                )}
              </div>
            </div>
          </div>
          {config.pricing_config && (
            <div className={factCellClass}>
              <DollarSign className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground leading-tight">
                  {t("學費", "Fee", lang)}
                </div>
                <div className="text-xs font-semibold text-foreground leading-snug mt-0.5 break-words">
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

      {/* Seasonal offer. Unlike summer there is no countdown and nothing to
          expand: one offer, a short list of what it includes, no tiers to
          compare. It sits directly under the facts strip so it reads as part
          of the same metadata zone rather than a second hero.

          The eligibility line is not decoration. The headline price is for new
          students only, and a returning parent who reads past that arrives at
          the fee message expecting a number we are not going to quote. */}
      {promo && (
        <div className="rounded-xl border border-amber-200 bg-gradient-to-b from-amber-50 to-amber-100/40 overflow-hidden">
          <div className="flex items-start gap-2.5 px-4 py-3">
            <BadgePercent className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-amber-900">
                  {promoName(promo, lang)}
                </span>
                <span className="inline-flex items-center rounded-full bg-amber-600 text-white px-2 py-0.5 text-[11px] font-bold">
                  {t(`省 $${promo.total_value}`, `Save $${promo.total_value}`, lang)}
                </span>
              </div>

              {promoItems(promo, lang).length > 0 && (
                <ul className="space-y-1">
                  {promoItems(promo, lang).map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-amber-900 leading-relaxed">
                      <Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}

              {promoPrice && (
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-2xl font-bold text-amber-900">
                    ${promoPrice.promoFee.toLocaleString("en-US")}
                  </span>
                  <span className="text-xs text-amber-800">
                    {t(
                      `／首期 ${config.pricing_config?.lessons_per_block ?? ""}堂`,
                      `/ first ${config.pricing_config?.lessons_per_block ?? ""} lessons`,
                      lang
                    )}
                  </span>
                  <span className="text-xs text-amber-700/80 line-through">
                    ${promoPrice.originalFee.toLocaleString("en-US")}
                  </span>
                </div>
              )}

              <p className="text-[11px] text-amber-800 leading-relaxed border-t border-amber-200/70 pt-2">
                {t(
                  "此優惠只適用於從未於 MathConcept 就讀的新生。",
                  "This offer is for new students who have never studied at MathConcept.",
                  lang
                )}
              </p>
            </div>
          </div>
        </div>
      )}

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
