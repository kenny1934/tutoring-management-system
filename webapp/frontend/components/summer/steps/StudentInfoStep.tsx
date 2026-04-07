import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  GraduationCap,
  Calendar,
  Clock,
  DollarSign,
  BadgePercent,
  Ticket,
  PenLine,
  Users,
  User,
  Info,
  ChevronDown,
} from "lucide-react";
import type { SummerCourseFormConfig } from "@/types";
import {
  type Lang,
  t,
  formatDateShort,
  inputClass,
  sectionClass,
  labelClass,
  radioGroupClass,
  radioLabelClass,
  RequiredMark,
  IconLabel,
  getActiveSummerPromo,
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
  /** When true, render the promo in its expanded state so the admin config
   *  preview can show the full content (the preview wrapper disables
   *  pointer events, so the normal tap-to-expand affordance is dead). */
  previewMode?: boolean;
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
  previewMode = false,
}: StudentInfoStepProps) {
  const hasLangStream = !!(config.lang_stream_options && config.lang_stream_options.length > 0);
  const pricing = config.pricing_config;
  const {
    ebActive,
    ebDateFormatted,
    daysUntilEb,
    groupFee,
    groupSavings,
    soloFee,
    soloSavings,
  } = getActiveSummerPromo(pricing, lang);

  const intro = config.course_intro;
  const introHeadline = intro?.headline;
  const introPillars = intro?.pillars ?? [];
  const introPhilosophy = intro?.philosophy;
  const hasIntro = !!(introHeadline || introPillars.length > 0 || introPhilosophy);

  const [promoExpandedState, setPromoExpanded] = useState(false);
  const promoExpanded = previewMode || promoExpandedState;

  // Biggest dollar savings hook for the collapsed promo summary line.
  const topSavings = groupSavings ?? soloSavings ?? null;

  return (
    <div className="space-y-6">
      {/* About this course — marketing pitch. The hero slogan is the pamphlet's
          brand-designed calligraphy, used as an image to preserve the brush-
          stroke treatment and visually tie this block to the WeChat marketing
          blast. This is the focal point of Step 1; everything below is a
          compact utility strip. */}
      {hasIntro && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {/* Full-bleed slogan band — integrates with the card top edge,
              compact height, with a thin gold accent line at the bottom that
              matches the header treatment. Uses a pre-padded 9:1 version of
              the slogan image (red bars added on each side at build time) so
              `object-cover` clips into the side padding rather than the
              calligraphy strokes — same trick a designer would use to fit a
              wide-aspect graphic into a narrower container. */}
          <div className="relative bg-[#B60D20] h-[72px] sm:h-[80px] overflow-hidden">
            <Image
              src="/summer/summer-slogan-wide.jpg"
              alt={t(
                introHeadline?.zh || "暑假12個鐘，來年數學好輕鬆",
                introHeadline?.en || "12 Hours This Summer, An Easier Year of Maths Ahead",
                lang
              )}
              width={4995}
              height={555}
              className="w-full h-full object-cover object-center block"
              priority
            />
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-[#F5C518]/80 to-transparent" />
          </div>

          <div className="px-5 pt-4 sm:px-8 sm:pt-5 pb-4 sm:pb-5 text-center space-y-3">
            {introPillars.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2 text-sm font-medium text-primary">
                {introPillars.map((p, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center justify-center text-center leading-snug min-h-[2.5rem] sm:border-l sm:border-primary/20 sm:first:border-l-0 sm:px-1"
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
        </div>
      )}

      {/* Course metadata cluster — fact strip + promo strip grouped tightly so
          they read as one metadata zone, not two separate hero cards. */}
      <div className="space-y-2">
      {/* Course Facts — compact horizontal strip (2x2 on mobile, 1x4 on sm+)
          so the marketing content above stays the focal point. */}
      <div className="rounded-xl bg-card border border-border px-4 py-3 sm:px-5 sm:py-3.5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-0 sm:divide-x sm:divide-border">
          <div className="flex items-center gap-2.5 sm:px-4 first:sm:pl-0 last:sm:pr-0">
            <GraduationCap className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground leading-tight">
                {t("對象", "Grades", lang)}
              </div>
              <div className="text-xs font-semibold text-foreground leading-tight mt-0.5 truncate">
                {t(
                  config.text_content?.target_grades_zh || "升F1–F3",
                  config.text_content?.target_grades_en || "Pre-F1 to Pre-F3",
                  lang
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 sm:px-4 first:sm:pl-0 last:sm:pr-0">
            <Calendar className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground leading-tight">
                {t("日期", "Dates", lang)}
              </div>
              <div className="text-xs font-semibold text-foreground leading-tight mt-0.5 truncate">
                {formatDateShort(config.course_start_date, lang)}–{formatDateShort(config.course_end_date, lang)}
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
                  config.text_content?.schedule_format_zh || `${config.total_lessons}堂 · 90分鐘`,
                  config.text_content?.schedule_format_en || `${config.total_lessons} × 90 min`,
                  lang
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 sm:px-4 first:sm:pl-0 last:sm:pr-0">
            <DollarSign className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground leading-tight">
                {t("學費", "Fee", lang)}
              </div>
              <div className="text-xs font-semibold text-foreground leading-tight mt-0.5 truncate">
                ${pricing.base_fee.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Promotional offers — one-line summary with countdown + biggest hook
          always visible; tap to expand for group/solo/coupon details. The
          collapsed header is styled as an explicit CTA (label + animated
          chevron) so parents recognize it as tappable. */}
      {groupFee !== null && (
        <div className="rounded-xl border border-amber-200 bg-gradient-to-b from-amber-50 to-amber-100/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setPromoExpanded((v) => !v)}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-amber-100/60 active:bg-amber-100 transition-colors"
            aria-expanded={promoExpanded}
          >
            <BadgePercent className="h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-amber-900 shrink-0">
                {t(`${config.year} 暑期優惠`, `${config.year} Special Offer`, lang)}
              </span>
              {ebActive && daysUntilEb !== null && (
                <span className="inline-flex items-center rounded-full bg-amber-600 text-white px-2 py-0.5 text-[11px] font-semibold">
                  {t(
                    `早鳥倒數 ${daysUntilEb} 日`,
                    `${daysUntilEb} day${daysUntilEb === 1 ? "" : "s"} left`,
                    lang
                  )}
                </span>
              )}
              {topSavings !== null && (
                <span className="text-xs font-medium text-amber-800">
                  {t(`最高省 $${topSavings}`, `save up to $${topSavings}`, lang)}
                </span>
              )}
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-amber-700 shrink-0">
              {promoExpanded
                ? t("收起", "Hide details", lang)
                : t("查看詳情", "View details", lang)}
            </span>
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-amber-700 transition-transform duration-200 ${promoExpanded ? "rotate-180" : ""}`}
            />
          </button>

          <AnimatePresence initial={false}>
          {promoExpanded && (
            <motion.div
              key="promo-details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
            <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-3 border-t border-amber-200/70">
              {ebActive && ebDateFormatted && (
                <p className="text-xs text-amber-800 pt-3">
                  {t(
                    `於 ${ebDateFormatted} 或之前報名即享早鳥優惠`,
                    `Enrol on or before ${ebDateFormatted} for early bird pricing`,
                    lang
                  )}
                </p>
              )}

              <div className="rounded-lg bg-white border-2 border-amber-300 p-3.5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-amber-100 p-2 shrink-0">
                    <Users className="h-5 w-5 text-amber-700" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
                        {t("三人同行", "Group of 3+", lang)}
                      </div>
                      {groupSavings !== null && (
                        <span className="inline-flex items-center rounded-full bg-amber-600 text-white px-2 py-0.5 text-[10px] font-bold">
                          {t(`省 $${groupSavings}`, `Save $${groupSavings}`, lang)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                      <span className="text-2xl font-bold text-amber-900">
                        ${groupFee?.toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("/ 每人", "/ per person", lang)}
                      </span>
                      <span className="text-xs text-muted-foreground line-through">
                        ${pricing.base_fee.toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-amber-800 mt-1.5 leading-relaxed">
                      {t(
                        "在報名表中建立或輸入同行碼即可享優惠",
                        "Create or enter a buddy code on the form to unlock",
                        lang
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {soloFee !== null && (
                <div className="rounded-lg bg-white/70 border border-amber-200 p-3">
                  <div className="flex items-center gap-2.5">
                    <User className="h-4 w-4 text-amber-700 shrink-0" />
                    <div className="flex-1 flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-amber-900">
                        {t("單人報讀", "Individual", lang)}
                      </span>
                      <span className="text-sm font-semibold text-amber-900">
                        ${soloFee.toLocaleString()}
                      </span>
                      {soloSavings !== null && (
                        <span className="text-[10px] text-amber-700 font-medium">
                          {t(`(省 $${soloSavings})`, `(save $${soloSavings})`, lang)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 text-xs text-amber-800 border-t border-amber-200 pt-3">
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
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      )}

      </div>{/* /metadata cluster */}

      {/* Inline notice placed right before the form fields — parents are about
          to act, and this is the moment to remind them the form is just a
          time-slot preference collection, not a formal registration. */}
      <div className="flex items-start gap-2.5 rounded-lg bg-primary/5 border border-primary/15 px-3.5 py-2.5">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary/70" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t(
            config.text_content?.intro_zh || "此表格僅為收集上課時間意向，並非正式報名。導師會於稍後聯絡家長確認留位。",
            config.text_content?.intro_en || "This form only collects your preferred class time — it is not a formal registration. Our team will contact you to confirm enrolment.",
            lang
          )}
        </p>
      </div>

      {/* Student Info Fields */}
      <div className={sectionClass}>
        <div>
          <label className={labelClass}>
            <IconLabel icon={PenLine}>
              {t("學生英文姓名：", "English name of the student:", lang)}
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
